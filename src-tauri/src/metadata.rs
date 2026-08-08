// ===== 元数据解析模块：lofty 封装 + 歌词提取 =====
use lofty::prelude::*;
use lofty::read_from_path;
use lofty::tag::ItemKey;
use serde::Serialize;
use std::path::Path;

/// 从单个文件解析出的元数据（不含 path/mtime）
#[derive(Debug, Clone, Default)]
pub struct TrackInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub duration: Option<f64>,
    pub bitrate: Option<i64>,
    pub sample_rate: Option<i64>,
    pub has_lyrics: bool,
    pub lyrics_type: Option<String>,
}

/// 歌词行（与前端 LyricLine 一致）
#[derive(Debug, Clone, Serialize)]
pub struct LyricLine {
    pub time: Option<f64>,
    pub text: String,
}

/// 解析后的歌词（与前端 ParsedLyrics 一致；字段 `type` 重命名为小写以匹配 JS 关键字）
#[derive(Debug, Clone, Serialize)]
pub struct ParsedLyrics {
    #[serde(rename = "type")]
    pub lyric_type: String,
    pub lines: Vec<LyricLine>,
    pub offset: Option<i64>,
}

impl ParsedLyrics {
    fn plain(text: String) -> Self {
        let lines: Vec<LyricLine> = text
            .lines()
            .map(|l| LyricLine {
                time: None,
                text: l.to_string(),
            })
            .collect();
        ParsedLyrics {
            lyric_type: "plain".to_string(),
            lines,
            offset: None,
        }
    }
}

/// 解析单个音频文件的元数据；失败返回 None（由扫描层跳过）
pub fn parse_file(path: &Path) -> Option<TrackInfo> {
    let tagged_file = read_from_path(path).ok()?;
    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();
    if !duration.is_finite() || duration <= 0.0 {
        return None;
    }
    let bitrate = properties.overall_bitrate().map(|b| b as i64);
    let sample_rate = properties.sample_rate().map(|s| s as i64);

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let mut info = TrackInfo {
        duration: Some(duration),
        bitrate,
        sample_rate,
        ..Default::default()
    };

    if let Some(tag) = tag {
        info.title = tag.title().map(|c| c.to_string());
        info.artist = tag.artist().map(|c| c.to_string());
        info.album = tag.album().map(|c| c.to_string());
        info.genre = tag.genre().map(|c| c.to_string());
        info.year = tag.year().map(|y| y as i64);
        info.track_no = tag.track().map(|t| t as i64);
        info.disc_no = tag.disk().map(|d| d as i64);
        info.album_artist = tag
            .get(&ItemKey::AlbumArtist)
            .and_then(|item| item.value().text())
            .map(|s| s.to_string());

        let (has, ty) = detect_lyrics(Some(tag), path);
        info.has_lyrics = has;
        info.lyrics_type = ty;
    } else {
        let (has, ty) = detect_lyrics(None, path);
        info.has_lyrics = has;
        info.lyrics_type = ty;
    }

    Some(info)
}

/// 按需提取完整歌词（嵌入式优先，其次外部 .lrc）
/// 优先级：TXXX:LYRICS（有时间戳）> USLT/ItemKey::Lyrics（无时间戳）> 外部 .lrc
pub fn get_lyrics(path: &str) -> Option<ParsedLyrics> {
    let p = Path::new(path);
    if let Ok(tagged_file) = read_from_path(p) {
        let tag = tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag());

        if let Some(tag) = tag {
            // 1) 优先：TXXX:LYRICS 自定义帧（通常带 LRC 时间戳）
            //    lofty 中映射为 ItemKey::Unknown("LYRICS") 等变体
            for item in tag.items() {
                match item.key() {
                    lofty::tag::ItemKey::Unknown(desc) => {
                        let d = desc.to_lowercase();
                        if d == "lyrics" || d == "lyric" {
                            if let Some(text) = item.value().text() {
                                let trimmed = text.trim();
                                if !trimmed.is_empty() {
                                    return Some(parse_lyrics_text(trimmed));
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }

            // 2) 其次：USLT / ItemKey::Lyrics（通常无时间戳）
            if let Some(text) = tag.get_string(&ItemKey::Lyrics) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(parse_lyrics_text(trimmed));
                }
            }

            // 3) 其他非标准 lyrics 帧（如 lyrics-eng 等）
            for item in tag.items() {
                let key_str = format!("{:?}", item.key()).to_lowercase();
                if key_str.contains("lyrics") || key_str.contains("lyric") {
                    if let Some(text) = item.value().text() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            return Some(parse_lyrics_text(trimmed));
                        }
                    }
                }
            }
        }
    }
    // 4) 外部 .lrc
    read_external_lrc(p).map(|t| parse_lyrics_text(t.trim()))
}

/// 简单启发式：判断一段文本是否看起来像歌词而非普通注释
fn looks_like_lyrics(text: &str) -> bool {
    let line_count = text.lines().filter(|l| !l.trim().is_empty()).count();
    line_count >= 3 || has_lrc_timestamps(text)
}

/// 轻量歌词探测（扫描时使用，避免构造完整行集合）
/// 优先级：TXXX:LYRICS > USLT > 其他 lyrics 帧 > 外部 .lrc
fn detect_lyrics(tag: Option<&lofty::tag::Tag>, path: &Path) -> (bool, Option<String>) {
    if let Some(tag) = tag {
        // 1) 优先：TXXX:LYRICS 自定义帧（带时间戳）
        for item in tag.items() {
            if let lofty::tag::ItemKey::Unknown(desc) = item.key() {
                let d = desc.to_lowercase();
                if d == "lyrics" || d == "lyric" {
                    if let Some(text) = item.value().text() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            return (true, Some(lyrics_kind(trimmed).to_string()));
                        }
                    }
                }
            }
        }

        // 2) USLT / ItemKey::Lyrics
        if let Some(text) = tag.get_string(&ItemKey::Lyrics) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return (true, Some(lyrics_kind(trimmed).to_string()));
            }
        }

        // 3) 其他非标准 lyrics 帧
        for item in tag.items() {
            let key_str = format!("{:?}", item.key()).to_lowercase();
            if key_str.contains("lyrics") || key_str.contains("lyric") {
                if let Some(text) = item.value().text() {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return (true, Some(lyrics_kind(trimmed).to_string()));
                    }
                }
            }
        }
    }

    // 4) 外部 .lrc
    if let Some(text) = read_external_lrc(path) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return (true, Some(lyrics_kind(trimmed).to_string()));
        }
    }
    (false, None)
}

/// 判断文本是 synced（含 LRC 时间戳）还是 plain
fn lyrics_kind(text: &str) -> &'static str {
    if has_lrc_timestamps(text) {
        "synced"
    } else {
        "plain"
    }
}

fn parse_lyrics_text(text: &str) -> ParsedLyrics {
    if has_lrc_timestamps(text) {
        parse_lrc(text)
    } else {
        ParsedLyrics::plain(text.to_string())
    }
}

/// 文本是否包含至少一个 LRC 时间戳 `[mm:ss.xx]`
fn has_lrc_timestamps(text: &str) -> bool {
    for line in text.lines() {
        let mut rest = line.trim_start();
        while let Some(stripped) = rest.strip_prefix('[') {
            if let Some(close) = stripped.find(']') {
                let inside = &stripped[..close];
                if parse_timestamp(inside).is_some() {
                    return true;
                }
                rest = &stripped[close + 1..];
            } else {
                break;
            }
        }
    }
    false
}

/// 解析 LRC 文本为同步歌词
fn parse_lrc(text: &str) -> ParsedLyrics {
    let mut lines: Vec<LyricLine> = Vec::new();
    let mut offset_ms: i64 = 0;
    let mut saw_any = false;

    for raw in text.lines() {
        let mut rest = raw.trim_start();
        let mut times: Vec<f64> = Vec::new();
        let mut is_meta_only = false;

        loop {
            rest = rest.trim_start();
            let Some(stripped) = rest.strip_prefix('[') else {
                break;
            };
            let Some(close) = stripped.find(']') else {
                break;
            };
            let inside = &stripped[..close];
            if let Some(t) = parse_timestamp(inside) {
                times.push(t);
            } else if let Some(val) = inside.strip_prefix("offset:") {
                if let Ok(n) = val.trim().parse::<i64>() {
                    offset_ms = n;
                }
                is_meta_only = true;
            } else if inside.contains(':') && !inside.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                // ti:/ar:/al:/by:/re:/ve: 等元信息
                is_meta_only = true;
            } else {
                is_meta_only = true;
            }
            rest = &stripped[close + 1..];
        }

        let text_part = rest.trim().to_string();
        if is_meta_only && times.is_empty() && text_part.is_empty() {
            continue;
        }
        saw_any = true;

        if times.is_empty() {
            if text_part.is_empty() {
                continue;
            }
            lines.push(LyricLine {
                time: None,
                text: text_part,
            });
        } else {
            let offset_secs = offset_ms as f64 / 1000.0;
            for t in times {
                lines.push(LyricLine {
                    time: Some(t + offset_secs),
                    text: text_part.clone(),
                });
            }
        }
    }

    if !saw_any {
        return ParsedLyrics::plain(text.to_string());
    }

    lines.sort_by(|a, b| {
        a.time
            .unwrap_or(-1.0)
            .partial_cmp(&b.time.unwrap_or(-1.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    ParsedLyrics {
        lyric_type: "synced".to_string(),
        lines,
        offset: Some(offset_ms),
    }
}

/// 解析 `mm:ss` 或 `mm:ss.xx` 为秒（失败返回 None）
fn parse_timestamp(s: &str) -> Option<f64> {
    let s = s.trim();
    let (mm, rest) = s.split_once(':')?;
    let mm: u64 = mm.trim().parse().ok()?;
    let (sec_str, frac_str) = match rest.split_once('.') {
        Some((a, b)) => (a, Some(b)),
        None => (rest, None),
    };
    let ss: u64 = sec_str.trim().parse().ok()?;
    let mut value = (mm * 60 + ss) as f64;
    if let Some(frac) = frac_str {
        let trimmed = frac.trim();
        if !trimmed.is_empty() {
            let divisor = 10f64.powi(trimmed.len() as i32);
            if let Ok(f) = trimmed.parse::<f64>() {
                value += f / divisor;
            }
        }
    }
    Some(value)
}

/// 尝试读取同名 .lrc 文件（替换扩展名 或 追加 .lrc）
fn read_external_lrc(path: &Path) -> Option<String> {
    let candidate = path.with_extension("lrc");
    if let Ok(text) = std::fs::read_to_string(&candidate) {
        return Some(text);
    }
    let appended = path.with_extension({
        let mut e = path.extension().map(|e| e.to_os_string()).unwrap_or_default();
        e.push(".lrc");
        e
    });
    std::fs::read_to_string(&appended).ok()
}
