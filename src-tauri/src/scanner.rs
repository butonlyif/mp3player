// ===== 扫描模块：递归遍历 + 增量构建 Track =====
use crate::db::Track;
use crate::metadata;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

/// 支持的音频扩展名白名单
pub fn supported_extensions() -> &'static [&'static str] {
    &[
        "mp3", "m4a", "flac", "ogg", "opus", "wav", "aiff", "wma",
    ]
}

/// 判断路径是否为受支持的音频文件
pub fn is_audio_file(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => supported_extensions().iter().any(|s| s.eq_ignore_ascii_case(ext)),
        None => false,
    }
}

/// 递归遍历目录，返回所有音频文件 (路径, mtime秒)。访问失败的条目静默跳过。
pub fn walk_audio_files(root: &Path) -> Vec<(PathBuf, i64)> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if !is_audio_file(path) {
            continue;
        }
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        out.push((path.to_path_buf(), mtime));
    }
    out
}

/// 由路径 + mtime 构造一条 Track（解析元数据；解析失败返回 None）
pub fn build_track(path: &Path, mtime: i64) -> Option<Track> {
    let info = metadata::parse_file(path)?;
    let path_str = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());
    let folder_path = path
        .parent()
        .and_then(|p| p.to_str())
        .map(|s| s.to_string());
    let now = chrono::Utc::now().timestamp();

    Some(Track {
        id: 0,
        path: path_str,
        file_name,
        title: info.title,
        artist: info.artist,
        album: info.album,
        album_artist: info.album_artist,
        folder_path,
        genre: info.genre,
        year: info.year,
        track_no: info.track_no,
        disc_no: info.disc_no,
        duration: info.duration,
        bitrate: info.bitrate,
        sample_rate: info.sample_rate,
        has_lyrics: info.has_lyrics as i64,
        lyrics_type: info.lyrics_type,
        file_mtime: Some(mtime),
        added_at: Some(now),
        play_count: 0,
        resonance: 0,
    })
}
