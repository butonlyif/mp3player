// ===== 底部播放控制栏 =====
import type { PlayMode } from '../store/useStore';

interface PlayerBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  coverArt: string | null;
  lyricsActive: boolean;
  eqActive: boolean;
  immersiveActive: boolean;
  playMode: PlayMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleLyrics: () => void;
  onToggleEq: () => void;
  onToggleImmersive: () => void;
  onCyclePlayMode: () => void;
}

/** 格式化时间 mm:ss */
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 播放模式图标 */
function playModeIcon(mode: PlayMode): string {
  switch (mode) {
    case 'shuffle':
      return '⇄';
    case 'repeat-one':
      return '↻';
    default:
      return '→';
  }
}

/** 播放模式标签 */
function playModeLabel(mode: PlayMode): string {
  switch (mode) {
    case 'shuffle':
      return '随机播放';
    case 'repeat-one':
      return '单曲循环';
    default:
      return '顺序播放';
  }
}

export default function PlayerBar(props: PlayerBarProps) {
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    title,
    artist,
    album,
    coverArt,
    lyricsActive,
    eqActive,
    immersiveActive,
    playMode,
    onTogglePlay,
    onNext,
    onPrev,
    onSeek,
    onVolumeChange,
    onToggleLyrics,
    onToggleEq,
    onToggleImmersive,
    onCyclePlayMode,
  } = props;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className={`playerbar glass-panel ${isPlaying ? 'is-playing' : ''}`}>
      {/* 左侧：当前曲目信息 + 封面 */}
      <div className="playerbar-info">
        <div className="playerbar-cover">
          {coverArt ? (
            <img src={coverArt} alt="封面" className="playerbar-cover-img" />
          ) : (
            <span className="playerbar-cover-placeholder">♪</span>
          )}
        </div>
        <div className="playerbar-info-text">
          <div className="playerbar-title truncate">
            {title || '未播放'}
          </div>
          <div className="playerbar-artist truncate text-muted">
            {artist ? `${artist}${album ? ' · ' + album : ''}` : ''}
          </div>
        </div>
      </div>

      {/* 中间：播放控制 + 进度条 */}
      <div className="playerbar-center">
        <div className="playerbar-controls">
          <button
            className={`icon-btn ${playMode !== 'sequence' ? 'active' : ''}`}
            title={playModeLabel(playMode)}
            onClick={onCyclePlayMode}
          >
            {playModeIcon(playMode)}
          </button>
          <button className="icon-btn" title="上一首" onClick={onPrev}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M3 3v10M13 3 L5 8 L13 13 Z" fill="currentColor" />
            </svg>
          </button>
          <button
            className="icon-btn playerbar-play-btn"
            title={isPlaying ? '暂停' : '播放'}
            onClick={onTogglePlay}
          >
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 18 18">
                <rect x="4" y="3" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="10.5" y="3" width="3.5" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path d="M4 3 L14 9 L4 15 Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button className="icon-btn" title="下一首" onClick={onNext}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M13 3v10M3 3 L11 8 L3 13 Z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="playerbar-progress">
          <span className="playerbar-time text-muted">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="playerbar-seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--accent) ${progress}%, rgba(128,128,128,0.15) ${progress}%)`,
            }}
          />
          <span className="playerbar-time text-muted">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右侧：歌词 + EQ + 音量 */}
      <div className="playerbar-right">
        <button
          className={`icon-btn ${lyricsActive ? 'active' : ''}`}
          title="歌词"
          onClick={onToggleLyrics}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M2 4h7M2 7h5M2 10h6M10 4l4 2-4 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className={`icon-btn ${eqActive ? 'active' : ''}`}
          title="均衡器"
          onClick={onToggleEq}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M2 13V3M6 13V7M10 13V5M14 13V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="2" cy="10" r="1.5" fill="currentColor" />
            <circle cx="6" cy="9" r="1.5" fill="currentColor" />
            <circle cx="10" cy="8" r="1.5" fill="currentColor" />
            <circle cx="14" cy="11" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <button
          className={`icon-btn ${immersiveActive ? 'active' : ''}`}
          title={immersiveActive ? '退出沉浸模式' : '进入沉浸模式'}
          aria-label={immersiveActive ? '退出沉浸模式' : '进入沉浸模式'}
          disabled={!title}
          onClick={onToggleImmersive}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 6.5c1.2-3.1 3.4-4 5.5-2 2.1-2 4.3-1.1 5.5 2-1.2 3.1-3.4 4-5.5 2-2.1 2-4.3 1.1-5.5-2Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="6.5" r="1.6" fill="currentColor" />
          </svg>
        </button>
        <div className="playerbar-volume">
          <svg width="14" height="14" viewBox="0 0 14 14" className="playerbar-volume-icon">
            <path d="M2 5v4h2l3 3V2L4 5H2z" fill="currentColor" />
            {volume > 0.3 && <path d="M8 4a3 3 0 010 6" fill="none" stroke="currentColor" strokeWidth="1" />}
            {volume > 0.6 && <path d="M9.5 2.5a5 5 0 010 9" fill="none" stroke="currentColor" strokeWidth="1" />}
          </svg>
          <input
            type="range"
            className="playerbar-volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--accent) ${volume * 100}%, rgba(128,128,128,0.15) ${volume * 100}%)`,
            }}
          />
        </div>
      </div>
    </footer>
  );
}
