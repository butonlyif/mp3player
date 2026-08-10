// ===== Tauri 命令层：所有 #[tauri::command] 函数 =====
use crate::db::{self, BatchTagError, BatchTagResult, BatchTagUpdate, EqPreset, WatchFolder};
use crate::metadata::{self, ParsedLyrics};
use crate::scanner;
use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use lofty::read_from_path;
use lofty::tag::{ItemKey, Tag};
use rusqlite::Connection;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

// re-export db 类型给命令签名使用
pub use crate::db::{Playlist, QueryOpts, ScanResult, Track};

/// 曲目的完整标签（用于编辑器预填充）
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct TrackTags {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub lyrics: Option<String>,
    pub cover_art: Option<String>, // data URI (data:image/jpeg;base64,...)
}

// ---------- 共用：增量扫描一个目录（带进度事件） ----------
fn sync_folder(conn: &Connection, root: &str, app: &AppHandle) -> rusqlite::Result<usize> {
    let root_path = Path::new(root);
    let files = scanner::walk_audio_files(root_path);
    let total = files.len();

    // 获取用户手动移除的黑名单路径，扫描时跳过
    let excluded = db::get_excluded_paths(conn).unwrap_or_default();

    let existing: HashMap<String, Option<i64>> =
        db::get_all_track_path_mtime(conn)?.into_iter().collect();

    let mut to_upsert: Vec<Track> = Vec::new();
    let mut present: HashSet<String> = HashSet::new();
    for (path, mtime) in &files {
        let ps = path.to_string_lossy().to_string();
        // 跳过黑名单路径
        if excluded.contains(&ps) {
            continue;
        }
        present.insert(ps.clone());
        let need = match existing.get(&ps) {
            Some(Some(prev)) => *prev != *mtime,
            _ => true,
        };
        if need {
            if let Some(t) = scanner::build_track(path, *mtime) {
                to_upsert.push(t);
            }
        }
    }

    db::insert_tracks(conn, &to_upsert)?;

    // 仅清理位于本目录下、本次未出现的文件（不影响其他监控目录）
    // 使用 Path API 进行跨平台路径前缀比较
    let root_path = Path::new(root);
    let all = db::get_all_track_paths(conn)?;
    let to_delete: Vec<i64> = all
        .iter()
        .filter(|(_, p)| Path::new(p).starts_with(root_path))
        .filter(|(_, p)| !present.contains(p.as_str()))
        .map(|(id, _)| *id)
        .collect();
    db::delete_tracks_by_ids(conn, &to_delete)?;

    // 发送进度事件
    let _ = app.emit("scan:progress", serde_json::json!({ "current": total, "total": total }));

    Ok(files.len())
}

fn ensure_trailing_sep(p: &str) -> String {
    let sep = std::path::MAIN_SEPARATOR;
    if p.ends_with(sep) {
        p.to_string()
    } else {
        format!("{p}{sep}")
    }
}

// ---------- 音乐库 ----------

/// 弹出系统目录选择对话框，添加监控目录并在后台异步扫描入库
#[tauri::command]
pub async fn library_add_folder(
    app: AppHandle,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let picked: Option<PathBuf> = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|fp| fp.into_path().map_err(|e| e.to_string()))
        .transpose()?;
    let Some(picked) = picked else {
        return Ok(()); // 用户取消
    };
    let root = picked.to_string_lossy().to_string();

    // 保存 watch_folder（短时间持锁）
    {
        let conn = state.lock().map_err(|e| e.to_string())?;
        db::add_watch_folder(&conn, &root).map_err(|e| e.to_string())?;
    }

    // 后台线程执行扫描，避免阻塞 UI
    let app_clone = app.clone();
    let db_conn = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = match db_conn.lock() {
            Ok(g) => g,
            Err(_) => {
                let _ = app_clone.emit("scan:done", serde_json::json!({"error": "db lock"}));
                return;
            }
        };
        let result = sync_folder(&conn, &root, &app_clone);
        // 扫描完成，发送事件
        let _ = app_clone.emit("scan:done", serde_json::json!({
            "scanned": result.as_ref().copied().unwrap_or(0),
            "error": result.err().map(|e| e.to_string()),
        }));
    });

    Ok(())
}

/// 扫描指定监控目录
#[tauri::command]
pub fn library_scan(
    folder_id: i64,
    app: AppHandle,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<ScanResult, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let folder = db::get_watch_folder(&conn, folder_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("监控文件夹 {folder_id} 不存在"))?;
    let scanned = sync_folder(&conn, &folder.path, &app).map_err(|e| e.to_string())?;
    Ok(ScanResult {
        scanned: scanned as i64,
    })
}

/// 扫描所有监控文件夹（启动时自动调用，后台线程执行避免阻塞）
#[tauri::command]
pub async fn library_scan_all(
    app: AppHandle,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<i64, String> {
    let db_conn = state.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = match db_conn.lock() {
            Ok(g) => g,
            Err(_) => return Err("db lock poisoned".to_string()),
        };
        let folders = db::get_watch_folders(&conn).map_err(|e| e.to_string())?;
        let mut total = 0i64;
        for folder in &folders {
            let n = sync_folder(&conn, &folder.path, &app).map_err(|e| e.to_string())?;
            total += n as i64;
        }
        Ok(total)
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))?;

    result.map_err(|e| e)
}

/// 查询监控文件夹列表
#[tauri::command]
pub fn library_list_folders(
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Vec<WatchFolder>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::get_watch_folders(&conn).map_err(|e| e.to_string())
}

/// 移除监控文件夹（同时删除该目录下的所有曲目，不删物理文件）
#[tauri::command]
pub fn library_remove_folder(
    folder_id: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;

    let folder = db::get_watch_folder(&conn, folder_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("监控文件夹 {folder_id} 不存在"))?;

    // 删除该目录下的所有曲目记录（不删物理文件）
    let root_path = Path::new(&folder.path);
    let all = db::get_all_track_paths(&conn).map_err(|e| e.to_string())?;
    let to_delete: Vec<i64> = all
        .iter()
        .filter(|(_, p)| Path::new(p).starts_with(root_path))
        .map(|(id, _)| *id)
        .collect();
    db::delete_tracks_by_ids(&conn, &to_delete).map_err(|e| e.to_string())?;

    // 删除监控文件夹记录
    db::remove_watch_folder(&conn, folder_id).map_err(|e| e.to_string())?;

    Ok(())
}

/// 查询曲目列表
#[tauri::command]
pub fn library_query(
    opts: QueryOpts,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Vec<Track>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::query_tracks(&conn, &opts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_update_resonance(
    track_id: i64,
    resonance: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::update_track_resonance(&conn, track_id, resonance).map_err(|e| e.to_string())
}

/// 获取歌词（嵌入式优先，其次外部 .lrc）
#[tauri::command]
pub fn library_get_lyrics(
    track_id: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Option<ParsedLyrics>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let path = db::get_track_path(&conn, track_id).map_err(|e| e.to_string())?;
    Ok(path.and_then(|p| metadata::get_lyrics(&p)))
}

/// 获取曲目文件路径（用于前端 convertFileSrc 播放）
#[tauri::command]
pub fn library_get_track_path(
    track_id: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<String, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::get_track_path(&conn, track_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("曲目 {track_id} 不存在"))
}

/// 保存播放进度；meaningful_play 每个播放会话最多传 true 一次。
#[tauri::command]
pub fn playback_record(
    track_id: i64,
    position: f64,
    meaningful_play: bool,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::record_playback_memory(&conn, track_id, position, meaningful_play).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playback_get_resume(
    track_id: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Option<f64>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::get_resume_position(&conn, track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playback_query_memory(
    mode: String,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Vec<Track>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::query_memory_tracks(&conn, &mode).map_err(|e| e.to_string())
}

/// 读取单个曲目的完整标签（含歌词、封面 base64），用于编辑器预填充
#[tauri::command]
pub fn library_get_track_tags(
    track_id: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<TrackTags, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let path = db::get_track_path(&conn, track_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("曲目 {track_id} 不存在"))?;

    let tagged_file = read_from_path(&path).map_err(|e| format!("读取标签失败: {e}"))?;
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let mut result = TrackTags::default();

    if let Some(tag) = tag {
        result.title = tag.title().map(|c| c.to_string());
        result.artist = tag.artist().map(|c| c.to_string());
        result.album = tag.album().map(|c| c.to_string());
        result.album_artist = tag.get(&ItemKey::AlbumArtist).and_then(|i| i.value().text()).map(|s| s.to_string());
        result.genre = tag.genre().map(|c| c.to_string());
        result.year = tag.year().map(|y| y as i64);
        result.track_no = tag.track().map(|t| t as i64);
        result.disc_no = tag.disk().map(|d| d as i64);

        // 歌词：优先 TXXX:LYRICS（有时间戳）→ USLT/ItemKey::Lyrics → 其他 lyrics 帧
        // 1) TXXX:LYRICS 自定义帧
        for item in tag.items() {
            if let lofty::tag::ItemKey::Unknown(desc) = item.key() {
                let d = desc.to_lowercase();
                if d == "lyrics" || d == "lyric" {
                    if let Some(text) = item.value().text() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            result.lyrics = Some(text.to_string());
                            break;
                        }
                    }
                }
            }
        }
        // 2) USLT / ItemKey::Lyrics
        if result.lyrics.is_none() {
            if let Some(text) = tag.get_string(&ItemKey::Lyrics) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    result.lyrics = Some(text.to_string());
                }
            }
        }
        // 3) 其他非标准 lyrics 帧
        if result.lyrics.is_none() {
            for item in tag.items() {
                let key_str = format!("{:?}", item.key()).to_lowercase();
                if key_str.contains("lyrics") || key_str.contains("lyric") {
                    if let Some(text) = item.value().text() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            result.lyrics = Some(text.to_string());
                            break;
                        }
                    }
                }
            }
        }

        // 封面：取第一张
        if let Some(pic) = tag.pictures().first() {
            use base64::{Engine as _, engine::general_purpose::STANDARD};
            let mime = match pic.mime_type() {
                Some(lofty::picture::MimeType::Png) => "image/png",
                Some(lofty::picture::MimeType::Jpeg) => "image/jpeg",
                Some(lofty::picture::MimeType::Gif) => "image/gif",
                Some(lofty::picture::MimeType::Tiff) => "image/tiff",
                Some(lofty::picture::MimeType::Bmp) => "image/bmp",
                Some(lofty::picture::MimeType::Unknown(s)) => s.as_str(),
                _ => "image/jpeg",
            };
            let b64 = STANDARD.encode(pic.data());
            result.cover_art = Some(format!("data:{};base64,{}", mime, b64));
        }
    }

    Ok(result)
}

/// 从音乐库删除曲目（可选是否同时删除文件）
#[tauri::command]
pub async fn library_delete_tracks(
    track_ids: Vec<i64>,
    delete_files: bool,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    // 持锁：获取路径 + DB 操作
    let (paths, ) = {
        let conn = state.lock().map_err(|e| e.to_string())?;

        let mut paths: Vec<String> = Vec::new();
        for id in &track_ids {
            if let Ok(Some(path)) = db::get_track_path(&conn, *id) {
                paths.push(path);
            }
        }

        if !delete_files {
            // 仅从库移除（不删文件）→ 加入黑名单
            db::add_excluded_paths(&conn, &paths).map_err(|e| e.to_string())?;
        }

        // 从数据库删除
        db::delete_tracks_by_ids(&conn, &track_ids).map_err(|e| e.to_string())?;
        (paths,)
    };
    // 锁已释放

    // 在锁外删除物理文件（避免 I/O 阻塞 DB）
    if delete_files {
        for p in &paths {
            let _ = std::fs::remove_file(p);
        }
    }

    Ok(())
}

// ---------- 播放清单 ----------

#[tauri::command]
pub fn playlist_create(
    name: String,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Playlist, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::create_playlist(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_rename(
    id: i64,
    name: String,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::rename_playlist(&conn, id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_delete(id: i64, state: State<'_, Arc<Mutex<Connection>>>) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::delete_playlist(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_list(state: State<'_, Arc<Mutex<Connection>>>) -> Result<Vec<Playlist>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::list_playlists(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_get_tracks(
    id: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<Vec<Track>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::get_playlist_tracks(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_add_tracks(
    id: i64,
    track_ids: Vec<i64>,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::add_tracks_to_playlist(&conn, id, &track_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_remove_tracks(
    id: i64,
    track_ids: Vec<i64>,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::remove_tracks_from_playlist(&conn, id, &track_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn playlist_reorder(
    id: i64,
    from_pos: i64,
    to_pos: i64,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::reorder_playlist(&conn, id, from_pos, to_pos).map_err(|e| e.to_string())
}

// ---------- 标签编辑 ----------

/// 批量写入标签到文件并同步数据库
#[tauri::command]
pub fn tag_batch_update(
    req: BatchTagUpdate,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<BatchTagResult, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut updated = 0i64;
    let mut errors: Vec<BatchTagError> = Vec::new();

    for tid in &req.track_ids {
        match write_track_tags(&conn, *tid, &req.fields, &req.mode) {
            Ok(()) => updated += 1,
            Err(e) => errors.push(BatchTagError {
                track_id: *tid,
                error: e,
            }),
        }
    }

    Ok(BatchTagResult {
        updated,
        failed: errors.len() as i64,
        errors,
    })
}

/// 写入单个曲目的标签（文件 + 数据库）
fn write_track_tags(
    conn: &Connection,
    track_id: i64,
    fields: &HashMap<String, Value>,
    mode: &str,
) -> Result<(), String> {
    let path = db::get_track_path(conn, track_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("曲目 {track_id} 不存在"))?;

    let mut tagged_file = read_from_path(&path).map_err(|e| format!("读取标签失败: {e}"))?;

    // 处理封面（需要在文本标签之前）
    if let Some(cover_data) = fields.get("coverArt") {
        if let Some(b64) = cover_data.as_str().filter(|s| !s.is_empty()) {
            // 解码 base64 图片
            let img_data = base64_decode_image(b64)?;
            let pic = Picture::new_unchecked(
                PictureType::CoverFront,
                Some(mime_type_from_b64(b64)),
                None,
                img_data,
            );
            // 通过 tag 设置封面（替换第一张）
            {
                let tag = if let Some(t) = tagged_file.primary_tag_mut() {
                    t
                } else if let Some(t) = tagged_file.first_tag_mut() {
                    t
                } else {
                    return Err("文件无可写标签".to_string());
                };
                // 清除所有旧图片，然后设置新封面
                for i in (0..tag.pictures().len()).rev() {
                    tag.remove_picture(i);
                }
                tag.push_picture(pic);
            }
        }
    }

    // 文本标签
    {
        let tag = if let Some(t) = tagged_file.primary_tag_mut() {
            t
        } else if let Some(t) = tagged_file.first_tag_mut() {
            t
        } else {
            return Err("文件无可写标签".to_string());
        };
        apply_fields(tag, fields, mode);
    }
    tagged_file
        .save_to_path(&path, WriteOptions::default())
        .map_err(|e| format!("写入标签失败: {e}"))?;

    let normalized = normalize_fields(fields);
    db::update_track_metadata(conn, track_id, &normalized).map_err(|e| format!("数据库更新失败: {e}"))?;
    Ok(())
}

/// 从 base64 字符串解码图片数据（去除 data URI 前缀）
fn base64_decode_image(b64: &str) -> Result<Vec<u8>, String> {
    let data = if b64.contains(',') {
        b64.split(',').last().unwrap_or(b64)
    } else {
        b64
    };
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.decode(data).map_err(|e| format!("图片解码失败: {e}"))
}

/// 从 base64 data URI 推断 MIME 类型
fn mime_type_from_b64(b64: &str) -> MimeType {
    if b64.starts_with("data:image/png") {
        MimeType::Png
    } else if b64.starts_with("data:image/gif") {
        MimeType::Gif
    } else if b64.starts_with("data:image/webp") {
        MimeType::Unknown("image/webp".to_string())
    } else {
        MimeType::Jpeg
    }
}

/// 将前端 camelCase 字段名归一化为数据库列名（snake_case）
fn normalize_fields(fields: &HashMap<String, Value>) -> HashMap<String, Value> {
    let mut out = HashMap::new();
    for (k, v) in fields {
        let nk = match k.as_str() {
            "albumArtist" => "album_artist",
            "trackNo" => "track_no",
            "discNo" => "disc_no",
            other => other,
        };
        out.insert(nk.to_string(), v.clone());
    }
    out
}

/// 把字段值应用到 lofty Tag（按 overwrite / fillEmpty 模式）
fn apply_fields(tag: &mut Tag, fields: &HashMap<String, Value>, mode: &str) {
    let overwrite = mode != "fillEmpty";
    for (key, val) in fields {
        match key.as_str() {
            "title" => {
                if let Some(s) = val.as_str().filter(|s| !s.is_empty()) {
                    let empty = tag.title().map(|c| c.trim().is_empty()).unwrap_or(true);
                    if overwrite || empty {
                        tag.set_title(s.to_string());
                    }
                }
            }
            "artist" => {
                if let Some(s) = val.as_str().filter(|s| !s.is_empty()) {
                    let empty = tag.artist().map(|c| c.trim().is_empty()).unwrap_or(true);
                    if overwrite || empty {
                        tag.set_artist(s.to_string());
                    }
                }
            }
            "album" => {
                if let Some(s) = val.as_str().filter(|s| !s.is_empty()) {
                    let empty = tag.album().map(|c| c.trim().is_empty()).unwrap_or(true);
                    if overwrite || empty {
                        tag.set_album(s.to_string());
                    }
                }
            }
            "genre" => {
                if let Some(s) = val.as_str().filter(|s| !s.is_empty()) {
                    let empty = tag.genre().map(|c| c.trim().is_empty()).unwrap_or(true);
                    if overwrite || empty {
                        tag.set_genre(s.to_string());
                    }
                }
            }
            "albumArtist" => {
                if let Some(s) = val.as_str().filter(|s| !s.is_empty()) {
                    let empty = tag
                        .get_string(&ItemKey::AlbumArtist)
                        .map(|c| c.trim().is_empty())
                        .unwrap_or(true);
                    if overwrite || empty {
                        tag.remove_key(&ItemKey::AlbumArtist);
                        tag.insert_text(ItemKey::AlbumArtist, s.to_string());
                    }
                }
            }
            "year" => {
                if let Some(n) = num_u32(val) {
                    let empty = tag.year().is_none();
                    if overwrite || empty {
                        tag.set_year(n);
                    }
                }
            }
            "trackNo" => {
                if let Some(n) = num_u32(val) {
                    let empty = tag.track().is_none();
                    if overwrite || empty {
                        tag.set_track(n);
                    }
                }
            }
            "discNo" => {
                if let Some(n) = num_u32(val) {
                    let empty = tag.disk().is_none();
                    if overwrite || empty {
                        tag.set_disk(n);
                    }
                }
            }
            "lyrics" => {
                // 歌词：写入 USLT 标签
                if let Some(s) = val.as_str().filter(|s| !s.is_empty()) {
                    let empty = tag.get_string(&ItemKey::Lyrics)
                        .map(|c| c.trim().is_empty())
                        .unwrap_or(true);
                    if overwrite || empty {
                        tag.remove_key(&ItemKey::Lyrics);
                        tag.insert_text(ItemKey::Lyrics, s.to_string());
                    }
                }
            }
            _ => {}
        }
    }
}

/// 从 JSON 值解析非负 u32
fn num_u32(v: &Value) -> Option<u32> {
    if let Some(n) = v.as_u64() {
        return u32::try_from(n).ok();
    }
    if let Some(f) = v.as_f64() {
        return if f >= 0.0 { Some(f as u32) } else { None };
    }
    if let Some(s) = v.as_str() {
        return s.trim().parse::<u32>().ok();
    }
    None
}

// ---------- 均衡器预设 ----------

#[tauri::command]
pub fn eq_list_presets(state: State<'_, Arc<Mutex<Connection>>>) -> Result<Vec<EqPreset>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::list_eq_presets(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn eq_save_preset(
    preset: EqPreset,
    state: State<'_, Arc<Mutex<Connection>>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::save_eq_preset(&conn, &preset).map_err(|e| e.to_string())
}
