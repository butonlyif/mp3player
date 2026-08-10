// ===== 数据库模块：rusqlite 封装、schema、DAO =====
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ---------- IPC / 数据结构 ----------

/// 曲目（原地引用：只存 path，不存文件内容）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub path: String,
    pub file_name: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub folder_path: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub duration: Option<f64>,
    pub bitrate: Option<i64>,
    pub sample_rate: Option<i64>,
    pub has_lyrics: i64,
    pub lyrics_type: Option<String>,
    pub file_mtime: Option<i64>,
    pub added_at: Option<i64>,
    pub play_count: i64,
    pub resonance: i64,
}

/// 监控文件夹
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchFolder {
    pub id: i64,
    pub path: String,
}

/// 播放清单（含曲目计数）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub track_count: i64,
}

/// EQ 预设（gains 存为 JSON 数组）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqPreset {
    pub id: Option<i64>,
    pub name: String,
    pub gains: Vec<f64>,
    pub builtin: bool,
}

/// 库查询选项（与前端 QueryOpts 一致，camelCase）
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryOpts {
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub filter_by: Option<String>,
    pub filter_value: Option<String>,
    pub search: Option<String>,
}

/// 扫描结果
#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub scanned: i64,
}

/// 批量标签更新请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTagUpdate {
    pub track_ids: Vec<i64>,
    pub fields: HashMap<String, serde_json::Value>,
    pub mode: String,
}

/// 批量标签更新单条错误
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTagError {
    pub track_id: i64,
    pub error: String,
}

/// 批量标签更新结果
#[derive(Debug, Clone, Serialize)]
pub struct BatchTagResult {
    pub updated: i64,
    pub failed: i64,
    pub errors: Vec<BatchTagError>,
}

// ---------- 行映射 ----------

fn row_to_track(row: &Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get("id")?,
        path: row.get("path")?,
        file_name: row.get("file_name")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get("album")?,
        album_artist: row.get("album_artist")?,
        folder_path: row.get("folder_path")?,
        genre: row.get("genre")?,
        year: row.get("year")?,
        track_no: row.get("track_no")?,
        disc_no: row.get("disc_no")?,
        duration: row.get("duration")?,
        bitrate: row.get("bitrate")?,
        sample_rate: row.get("sample_rate")?,
        has_lyrics: row.get("has_lyrics")?,
        lyrics_type: row.get("lyrics_type")?,
        file_mtime: row.get("file_mtime")?,
        added_at: row.get("added_at")?,
        play_count: row.get("play_count")?,
        resonance: row.get("resonance")?,
    })
}

const TRACK_COLUMNS: &str = "path, file_name, title, artist, album, album_artist, folder_path, \
     genre, year, track_no, disc_no, duration, bitrate, sample_rate, has_lyrics, lyrics_type, \
     file_mtime, added_at, play_count, resonance";

/// 列名白名单（防 SQL 注入）
fn is_valid_column(col: &str) -> bool {
    matches!(
        col,
        "file_name"
            | "title"
            | "artist"
            | "album"
            | "album_artist"
            | "folder_path"
            | "genre"
            | "year"
            | "track_no"
            | "disc_no"
            | "duration"
            | "bitrate"
            | "sample_rate"
            | "has_lyrics"
            | "lyrics_type"
            | "file_mtime"
            | "added_at"
            | "play_count"
            | "resonance"
    )
}

// ---------- 初始化 ----------

/// 打开/创建数据库，开启 WAL 与外键，建表，内置 EQ 预设
pub fn init_db(app_data_dir: &std::path::Path) -> rusqlite::Result<Connection> {
    std::fs::create_dir_all(app_data_dir).ok();
    let db_path = app_data_dir.join("lumen.db");
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA synchronous = NORMAL;",
    )?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tracks (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            path          TEXT UNIQUE NOT NULL,
            file_name     TEXT,
            title         TEXT,
            artist        TEXT,
            album         TEXT,
            album_artist  TEXT,
            folder_path   TEXT,
            genre         TEXT,
            year          INTEGER,
            track_no      INTEGER,
            disc_no       INTEGER,
            duration      REAL,
            bitrate       INTEGER,
            sample_rate   INTEGER,
            has_lyrics    INTEGER DEFAULT 0,
            lyrics_type   TEXT,
            file_mtime    INTEGER,
            added_at      INTEGER,
            play_count    INTEGER DEFAULT 0,
            resonance     INTEGER NOT NULL DEFAULT 0 CHECK(resonance BETWEEN 0 AND 3)
        );
        CREATE INDEX IF NOT EXISTS idx_album       ON tracks(album);
        CREATE INDEX IF NOT EXISTS idx_folder_path ON tracks(folder_path);
        CREATE INDEX IF NOT EXISTS idx_file_name   ON tracks(file_name);
        CREATE INDEX IF NOT EXISTS idx_title       ON tracks(title);
        CREATE INDEX IF NOT EXISTS idx_artist      ON tracks(artist);

        CREATE TABLE IF NOT EXISTS watch_folders (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            path  TEXT UNIQUE NOT NULL
        );

        -- 用户手动从库中移除（不删文件）的路径黑名单
        CREATE TABLE IF NOT EXISTS excluded_paths (
            path  TEXT PRIMARY KEY NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eq_presets (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            name   TEXT UNIQUE NOT NULL,
            gains  TEXT NOT NULL,
            builtin INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id INTEGER NOT NULL,
            track_id    INTEGER NOT NULL,
            position    INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pl_position ON playlist_tracks(playlist_id, position);",
    )?;

    ensure_track_resonance_column(&conn)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS playback_memory (
            track_id        INTEGER PRIMARY KEY,
            last_played     INTEGER,
            play_count      INTEGER NOT NULL DEFAULT 0,
            resume_position REAL NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_memory_recent ON playback_memory(last_played DESC);
        CREATE INDEX IF NOT EXISTS idx_memory_frequent ON playback_memory(play_count DESC, last_played DESC);",
    )?;

    seed_builtin_eq(&conn)?;
    Ok(conn)
}

fn ensure_track_resonance_column(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(tracks)")?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for column in columns {
        if column? == "resonance" {
            return Ok(());
        }
    }
    conn.execute(
        "ALTER TABLE tracks ADD COLUMN resonance INTEGER NOT NULL DEFAULT 0 CHECK(resonance BETWEEN 0 AND 3)",
        [],
    )?;
    Ok(())
}

fn seed_builtin_eq(conn: &Connection) -> rusqlite::Result<()> {
    fn gains(arr: [f64; 10]) -> String {
        serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string())
    }
    let presets: &[(&str, [f64; 10])] = &[
        ("Flat", [0.0; 10]),
        ("Bass Boost", [6.0, 5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
        ("Treble Boost", [0.0, 0.0, 0.0, 0.0, 0.0, 2.0, 4.0, 5.0, 6.0, 6.0]),
        ("Vocal", [-2.0, -1.0, 0.0, 2.0, 4.0, 4.0, 3.0, 1.0, 0.0, -1.0]),
        ("Rock", [4.0, 3.0, 1.0, 0.0, -1.0, 0.0, 1.0, 3.0, 4.0, 4.0]),
        ("Pop", [-1.0, 1.0, 3.0, 4.0, 3.0, 1.0, 0.0, -1.0, -1.0, -1.0]),
        ("Classical", [3.0, 2.0, 0.0, 0.0, 0.0, -1.0, -1.0, 0.0, 2.0, 3.0]),
        ("Acoustic", [3.0, 2.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0]),
    ];
    for (name, g) in presets {
        conn.execute(
            "INSERT OR IGNORE INTO eq_presets (name, gains, builtin) VALUES (?, ?, 1)",
            params![name, gains(*g)],
        )?;
    }
    Ok(())
}

// ---------- Track DAO ----------

/// 批量插入或更新（按 path 去重，保留 id/added_at/play_count）
pub fn insert_tracks(conn: &Connection, tracks: &[Track]) -> rusqlite::Result<()> {
    if tracks.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    let sql = format!(
        "INSERT INTO tracks ({cols}) VALUES \
         (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20) \
         ON CONFLICT(path) DO UPDATE SET \
           file_name=excluded.file_name, title=excluded.title, artist=excluded.artist, \
           album=excluded.album, album_artist=excluded.album_artist, folder_path=excluded.folder_path, \
           genre=excluded.genre, year=excluded.year, track_no=excluded.track_no, disc_no=excluded.disc_no, \
           duration=excluded.duration, bitrate=excluded.bitrate, sample_rate=excluded.sample_rate, \
           has_lyrics=excluded.has_lyrics, lyrics_type=excluded.lyrics_type, file_mtime=excluded.file_mtime",
        cols = TRACK_COLUMNS
    );
    {
        let mut stmt = tx.prepare(&sql)?;
        for t in tracks {
            stmt.execute(params![
                t.path,
                t.file_name,
                t.title,
                t.artist,
                t.album,
                t.album_artist,
                t.folder_path,
                t.genre,
                t.year,
                t.track_no,
                t.disc_no,
                t.duration,
                t.bitrate,
                t.sample_rate,
                t.has_lyrics,
                t.lyrics_type,
                t.file_mtime,
                t.added_at.unwrap_or(0),
                t.play_count,
                t.resonance,
            ])?;
        }
    }
    tx.commit()
}

/// 查询曲目（支持排序、搜索、过滤）
pub fn query_tracks(conn: &Connection, opts: &QueryOpts) -> rusqlite::Result<Vec<Track>> {
    let mut sql = String::from("SELECT * FROM tracks");
    let mut conditions: Vec<String> = Vec::new();
    let mut bind: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(search) = &opts.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let like = format!("%{}%", trimmed);
            conditions.push(
                "(title LIKE ? OR artist LIKE ? OR album LIKE ? OR file_name LIKE ?)".to_string(),
            );
            for _ in 0..4 {
                bind.push(Box::new(like.clone()));
            }
        }
    }
    if let (Some(fb), Some(fv)) = (&opts.filter_by, &opts.filter_value) {
        if is_valid_column(fb) && !fv.trim().is_empty() {
            conditions.push(format!("{} = ?", fb));
            bind.push(Box::new(fv.clone()));
        }
    }
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    let sort_by = opts
        .sort_by
        .as_deref()
        .filter(|s| is_valid_column(s))
        .unwrap_or("file_name");
    let sort_dir = match opts.sort_order.as_deref() {
        Some("desc") | Some("DESC") => "DESC",
        _ => "ASC",
    };
    sql.push_str(&format!(" ORDER BY {} COLLATE NOCASE {}", sort_by, sort_dir));

    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(params_refs.as_slice(), row_to_track)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get_track_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<Track>> {
    let mut stmt = conn.prepare("SELECT * FROM tracks WHERE id = ?")?;
    let mut rows = stmt.query_map(params![id], row_to_track)?;
    match rows.next() {
        Some(Ok(t)) => Ok(Some(t)),
        Some(Err(e)) => Err(e),
        None => Ok(None),
    }
}

pub fn update_track_resonance(
    conn: &Connection,
    track_id: i64,
    resonance: i64,
) -> rusqlite::Result<()> {
    if !(0..=3).contains(&resonance) {
        return Err(rusqlite::Error::InvalidParameterName(
            "resonance must be 0..=3".into(),
        ));
    }
    let changed = conn.execute(
        "UPDATE tracks SET resonance = ?1 WHERE id = ?2",
        params![resonance, track_id],
    )?;
    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/// 仅取路径（供 URI scheme handler 使用）
pub fn get_track_path(conn: &Connection, id: i64) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT path FROM tracks WHERE id = ?",
        params![id],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other),
    })
}

/// 批量编辑后更新数据库行
pub fn update_track_metadata(
    conn: &Connection,
    id: i64,
    fields: &HashMap<String, serde_json::Value>,
) -> rusqlite::Result<()> {
    let allowed = [
        "title",
        "artist",
        "album",
        "album_artist",
        "genre",
        "year",
        "track_no",
        "disc_no",
    ];
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for (k, v) in fields {
        if !allowed.contains(&k.as_str()) {
            continue;
        }
        sets.push(format!("{} = ?", k));
        match v {
            serde_json::Value::Null => vals.push(Box::new(None::<String>)),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    vals.push(Box::new(i));
                } else if let Some(f) = n.as_f64() {
                    vals.push(Box::new(f));
                } else {
                    vals.push(Box::new(v.to_string()));
                }
            }
            serde_json::Value::String(s) => {
                if s.is_empty() {
                    vals.push(Box::new(None::<String>));
                } else {
                    vals.push(Box::new(s.clone()));
                }
            }
            other => vals.push(Box::new(other.to_string())),
        }
    }

    if sets.is_empty() {
        return Ok(());
    }
    let sql = format!("UPDATE tracks SET {} WHERE id = ?", sets.join(", "));
    vals.push(Box::new(id));
    let params_refs: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|b| b.as_ref()).collect();
    conn.execute(&sql, params_refs.as_slice())?;
    Ok(())
}

/// 取全部 (id, path) 对（增量扫描比对用）
pub fn get_all_track_paths(conn: &Connection) -> rusqlite::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT id, path FROM tracks")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// 取全部 (path, mtime) 对（增量扫描判断是否需重新解析）
pub fn get_all_track_path_mtime(conn: &Connection) -> rusqlite::Result<Vec<(String, Option<i64>)>> {
    let mut stmt = conn.prepare("SELECT path, file_mtime FROM tracks")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// 按 id 批量删除曲目（用于增量扫描时清理已不存在的文件）
pub fn delete_tracks_by_ids(conn: &Connection, ids: &[i64]) -> rusqlite::Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut removed = 0usize;
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare("DELETE FROM tracks WHERE id = ?")?;
        for id in ids {
            removed += stmt.execute(params![id])?;
        }
    }
    tx.commit()?;
    Ok(removed)
}

/// 将路径加入排除黑名单（用户手动移除但不删文件）
pub fn add_excluded_paths(conn: &Connection, paths: &[String]) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare("INSERT OR IGNORE INTO excluded_paths (path) VALUES (?1)")?;
        for p in paths {
            let _ = stmt.execute(params![p]);
        }
    }
    tx.commit()?;
    Ok(())
}

/// 获取排除黑名单
pub fn get_excluded_paths(conn: &Connection) -> rusqlite::Result<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT path FROM excluded_paths")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut set = std::collections::HashSet::new();
    for r in rows {
        set.insert(r?);
    }
    Ok(set)
}

/// 删除路径不在 existing_paths 中的曲目
pub fn delete_missing_tracks(
    conn: &Connection,
    existing_paths: &HashSet<String>,
) -> rusqlite::Result<usize> {
    let all = get_all_track_paths(conn)?;
    let mut removed = 0usize;
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare("DELETE FROM tracks WHERE id = ?")?;
        for (id, path) in &all {
            if !existing_paths.contains(path) {
                removed += stmt.execute(params![id])?;
            }
        }
    }
    tx.commit()?;
    Ok(removed)
}

// ---------- WatchFolder DAO ----------

pub fn add_watch_folder(conn: &Connection, path: &str) -> rusqlite::Result<WatchFolder> {
    conn.execute(
        "INSERT OR IGNORE INTO watch_folders (path) VALUES (?)",
        params![path],
    )?;
    get_watch_folder_by_path(conn, path)?
        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)
}

fn get_watch_folder_by_path(
    conn: &Connection,
    path: &str,
) -> rusqlite::Result<Option<WatchFolder>> {
    conn.query_row(
        "SELECT id, path FROM watch_folders WHERE path = ?",
        params![path],
        |row| {
            Ok(WatchFolder {
                id: row.get(0)?,
                path: row.get(1)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other),
    })
}

pub fn get_watch_folder(conn: &Connection, id: i64) -> rusqlite::Result<Option<WatchFolder>> {
    conn.query_row(
        "SELECT id, path FROM watch_folders WHERE id = ?",
        params![id],
        |row| {
            Ok(WatchFolder {
                id: row.get(0)?,
                path: row.get(1)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other),
    })
}

pub fn get_watch_folders(conn: &Connection) -> rusqlite::Result<Vec<WatchFolder>> {
    let mut stmt = conn.prepare("SELECT id, path FROM watch_folders ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok(WatchFolder {
            id: row.get(0)?,
            path: row.get(1)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// 删除监控文件夹记录
pub fn remove_watch_folder(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM watch_folders WHERE id = ?", params![id])?;
    Ok(())
}

// ---------- Playlist DAO ----------

pub fn create_playlist(conn: &Connection, name: &str) -> rusqlite::Result<Playlist> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)",
        params![name, now, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Playlist {
        id,
        name: name.to_string(),
        created_at: now,
        updated_at: now,
        track_count: 0,
    })
}

pub fn rename_playlist(conn: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?",
        params![name, now, id],
    )?;
    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", params![id])?;
    tx.execute("DELETE FROM playlists WHERE id = ?", params![id])?;
    tx.commit()
}

pub fn list_playlists(conn: &Connection) -> rusqlite::Result<Vec<Playlist>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.created_at, p.updated_at, \
         (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count \
         FROM playlists p ORDER BY p.id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            track_count: row.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get_playlist_tracks(conn: &Connection, id: i64) -> rusqlite::Result<Vec<Track>> {
    let mut stmt = conn.prepare(
        "SELECT t.* FROM tracks t \
         JOIN playlist_tracks pt ON pt.track_id = t.id \
         WHERE pt.playlist_id = ? ORDER BY pt.position",
    )?;
    let rows = stmt.query_map(params![id], row_to_track)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn add_tracks_to_playlist(
    conn: &Connection,
    id: i64,
    track_ids: &[i64],
) -> rusqlite::Result<()> {
    if track_ids.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    let max_pos: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id = ?",
        params![id],
        |row| row.get(0),
    )?;
    let mut pos = max_pos + 1;
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
        )?;
        for tid in track_ids {
            stmt.execute(params![id, tid, pos])?;
            pos += 1;
        }
    }
    touch_playlist(&tx, id)?;
    tx.commit()
}

pub fn remove_tracks_from_playlist(
    conn: &Connection,
    id: i64,
    track_ids: &[i64],
) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
        )?;
        for tid in track_ids {
            stmt.execute(params![id, tid])?;
        }
    }
    renumber_positions(&tx, id)?;
    touch_playlist(&tx, id)?;
    tx.commit()
}

pub fn reorder_playlist(
    conn: &Connection,
    id: i64,
    from_pos: i64,
    to_pos: i64,
) -> rusqlite::Result<()> {
    if from_pos == to_pos {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    // 收集当前有序曲目
    let mut ordered: Vec<i64> = {
        let mut stmt = tx.prepare(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position",
        )?;
        let rows = stmt.query_map(params![id], |row| row.get::<_, i64>(0))?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        v
    };
    let from = from_pos as usize;
    let to = to_pos as usize;
    if from >= ordered.len() || to >= ordered.len() {
        return Ok(());
    }
    let item = ordered.remove(from);
    ordered.insert(to, item);
    // 重新写入位置
    tx.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?",
        params![id],
    )?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
        )?;
        for (i, tid) in ordered.iter().enumerate() {
            stmt.execute(params![id, tid, i as i64])?;
        }
    }
    touch_playlist(&tx, id)?;
    tx.commit()
}

fn touch_playlist(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE playlists SET updated_at = ? WHERE id = ?",
        params![chrono::Utc::now().timestamp(), id],
    )?;
    Ok(())
}

fn renumber_positions(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let ordered: Vec<i64> = {
        let mut stmt = conn.prepare(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position",
        )?;
        let rows = stmt.query_map(params![id], |row| row.get::<_, i64>(0))?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        v
    };
    {
        let mut stmt =
            conn.prepare("UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?")?;
        for (i, tid) in ordered.iter().enumerate() {
            stmt.execute(params![i as i64, id, tid])?;
        }
    }
    Ok(())
}

// ---------- Playback memory DAO ----------

pub fn record_playback_memory(
    conn: &Connection,
    track_id: i64,
    position: f64,
    meaningful_play: bool,
) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp();
    let increment = i64::from(meaningful_play);
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO playback_memory (track_id, last_played, play_count, resume_position, updated_at)
         VALUES (?1, CASE WHEN ?3 = 1 THEN ?2 ELSE NULL END, ?3, ?4, ?2)
         ON CONFLICT(track_id) DO UPDATE SET
           last_played = CASE WHEN ?3 = 1 THEN ?2 ELSE playback_memory.last_played END,
           play_count = playback_memory.play_count + ?3,
           resume_position = ?4,
           updated_at = ?2",
        params![track_id, now, increment, position.max(0.0)],
    )?;
    if meaningful_play {
        tx.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?",
            params![track_id],
        )?;
    }
    tx.commit()
}

pub fn get_resume_position(conn: &Connection, track_id: i64) -> rusqlite::Result<Option<f64>> {
    let mut stmt = conn.prepare("SELECT resume_position FROM playback_memory WHERE track_id = ?")?;
    let mut rows = stmt.query(params![track_id])?;
    Ok(rows.next()?.map(|row| row.get(0)).transpose()?)
}

pub fn query_memory_tracks(conn: &Connection, mode: &str) -> rusqlite::Result<Vec<Track>> {
    let order = if mode == "frequent" {
        "m.play_count DESC, m.last_played DESC"
    } else {
        "m.last_played DESC"
    };
    let sql = format!(
        "SELECT t.* FROM tracks t JOIN playback_memory m ON m.track_id = t.id
         WHERE m.last_played IS NOT NULL ORDER BY {order} LIMIT 100"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_track)?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

// ---------- EQ Preset DAO ----------

pub fn list_eq_presets(conn: &Connection) -> rusqlite::Result<Vec<EqPreset>> {
    let mut stmt = conn.prepare("SELECT id, name, gains, builtin FROM eq_presets ORDER BY builtin DESC, id")?;
    let rows = stmt.query_map([], |row| {
        let gains_text: String = row.get(2)?;
        let gains: Vec<f64> =
            serde_json::from_str(&gains_text).unwrap_or_else(|_| vec![0.0; 10]);
        let builtin: i64 = row.get(3)?;
        Ok(EqPreset {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            gains,
            builtin: builtin != 0,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn save_eq_preset(conn: &Connection, preset: &EqPreset) -> rusqlite::Result<()> {
    let gains_json = serde_json::to_string(&preset.gains).unwrap_or_else(|_| "[]".to_string());
    let builtin_int = if preset.builtin { 1 } else { 0 };
    // 按 name 去重 upsert；id 由数据库管理
    conn.execute(
        "INSERT INTO eq_presets (name, gains, builtin) VALUES (?, ?, ?) \
         ON CONFLICT(name) DO UPDATE SET gains = excluded.gains, builtin = excluded.builtin",
        params![preset.name, gains_json, builtin_int],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_connection() -> Connection {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("soul-play-resonance-{nonce}"));
        init_db(&dir).expect("initialize test database")
    }

    #[test]
    fn resonance_defaults_updates_validates_and_survives_upsert() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO tracks (path, file_name) VALUES (?1, ?2)",
            params!["/music/song.mp3", "song.mp3"],
        )
        .unwrap();
        let id = conn.last_insert_rowid();

        assert_eq!(get_track_by_id(&conn, id).unwrap().unwrap().resonance, 0);
        update_track_resonance(&conn, id, 3).unwrap();
        assert_eq!(get_track_by_id(&conn, id).unwrap().unwrap().resonance, 3);
        assert!(update_track_resonance(&conn, id, 4).is_err());

        let mut rescanned = get_track_by_id(&conn, id).unwrap().unwrap();
        rescanned.title = Some("Rescanned title".into());
        insert_tracks(&conn, &[rescanned]).unwrap();
        let after = get_track_by_id(&conn, id).unwrap().unwrap();
        assert_eq!(after.title.as_deref(), Some("Rescanned title"));
        assert_eq!(after.resonance, 3);
    }
}
