// ===== Soul Play 后端入口 =====
mod commands;
pub mod db;
mod metadata;
mod scanner;

use rusqlite::Connection;
use std::io::{Read, Seek, SeekFrom};
use std::sync::{Arc, Mutex};
use tauri::http::{header, HeaderMap, Response, StatusCode};
use tauri::Manager;

/// 流式音频 MIME 推断
fn audio_mime(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("ogg") => "audio/ogg",
        Some("opus") => "audio/ogg",
        Some("m4a") | Some("mp4") | Some("aac") => "audio/mp4",
        Some("wav") => "audio/wav",
        Some("aiff") | Some("aif") => "audio/aiff",
        Some("wma") => "audio/x-ms-wma",
        _ => "audio/mpeg",
    }
}

/// 解析 Range 头：`bytes=start-end` 或 `bytes=start-`
fn parse_range(value: &str) -> Option<(u64, Option<u64>)> {
    let value = value.strip_prefix("bytes=")?;
    let (start_s, end_s) = value.split_once('-')?;
    let start: u64 = start_s.trim().parse().ok()?;
    let end = if end_s.trim().is_empty() {
        None
    } else {
        Some(end_s.trim().parse::<u64>().ok()?)
    };
    Some((start, end))
}

/// 从 URL 路径解析 track id（取最后一个数字段，兼容 host 差异）
fn parse_track_id(path: &str) -> Option<i64> {
    path.split('/')
        .filter(|s| !s.is_empty())
        .last()?
        .parse::<i64>()
        .ok()
}

/// 构造音频响应（支持 HTTP Range）
fn build_audio_response(path: &str, headers: &HeaderMap) -> Response<Vec<u8>> {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return plain_text(StatusCode::NOT_FOUND, "file not found"),
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    if total == 0 {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_LENGTH, "0")
            .body(Vec::new())
            .unwrap();
    }

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(parse_range);

    let (start, end, status) = match range {
        Some((s, _)) if s >= total => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{total}"))
                .body(Vec::new())
                .unwrap();
        }
        Some((s, e)) => {
            let end_incl = e.unwrap_or(total - 1).min(total - 1);
            (s, end_incl, StatusCode::PARTIAL_CONTENT)
        }
        None => (0, total - 1, StatusCode::OK),
    };

    let length = end - start + 1;
    if file.seek(SeekFrom::Start(start)).is_err() {
        return plain_text(StatusCode::INTERNAL_SERVER_ERROR, "seek failed");
    }
    let mut buf = Vec::with_capacity(length.min(1 << 24) as usize);
    let mut take = file.take(length);
    let _ = take.read_to_end(&mut buf);

    let mut builder = Response::builder().status(status).header(
        header::CONTENT_TYPE,
        audio_mime(path),
    );
    builder = builder.header(header::ACCEPT_RANGES, "bytes");
    builder = builder.header(header::CONTENT_LENGTH, buf.len());
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}"),
        );
    }
    builder.body(buf).unwrap_or_else(|_| plain_text(StatusCode::INTERNAL_SERVER_ERROR, "build failed"))
}

fn plain_text(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .register_uri_scheme_protocol("lumen-audio", |ctx, request| {
            let track_id = match parse_track_id(request.uri().path()) {
                Some(id) => id,
                None => return plain_text(StatusCode::BAD_REQUEST, "invalid track id"),
            };
            let path = {
                let state = ctx.app_handle().state::<Arc<Mutex<Connection>>>();
                let guard = match state.lock() {
                    Ok(g) => g,
                    Err(_) => return plain_text(StatusCode::INTERNAL_SERVER_ERROR, "db lock"),
                };
                match db::get_track_path(&guard, track_id) {
                    Ok(Some(p)) => p,
                    _ => return plain_text(StatusCode::NOT_FOUND, "track not found"),
                }
            };
            build_audio_response(&path, request.headers())
        })
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            // 确保数据目录存在
            std::fs::create_dir_all(&app_data)?;
            let conn = db::init_db(&app_data)?;
            app.manage(Arc::new(Mutex::new(conn)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 音乐库
            commands::library_add_folder,
            commands::library_scan,
            commands::library_scan_all,
            commands::library_list_folders,
            commands::library_remove_folder,
            commands::library_query,
            commands::library_update_resonance,
            commands::library_get_lyrics,
            commands::library_get_track_path,
            commands::library_get_track_tags,
            commands::library_delete_tracks,
            // 听歌记忆
            commands::playback_record,
            commands::playback_get_resume,
            commands::playback_query_memory,
            // 播放清单
            commands::playlist_create,
            commands::playlist_rename,
            commands::playlist_delete,
            commands::playlist_list,
            commands::playlist_get_tracks,
            commands::playlist_add_tracks,
            commands::playlist_remove_tracks,
            commands::playlist_reorder,
            // 标签
            commands::tag_batch_update,
            // 均衡器
            commands::eq_list_presets,
            commands::eq_save_preset,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal error running application: {e}");
            std::process::exit(1);
        });
}
