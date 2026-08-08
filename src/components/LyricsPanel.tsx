// ===== 歌词面板（全高侧边抽屉） =====
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { findCurrentLine } from '../lyrics/LyricsScroller';

export default function LyricsPanel() {
  const lyrics = useStore((s) => s.lyrics);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.duration);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // 对 plain 歌词：将各行均匀分配到歌曲时长上（每行占总时长的 1/(lines+1)）
  const activeIndex = useMemo(() => {
    if (!lyrics || lyrics.lines.length === 0) return -1;

    if (lyrics.type === 'synced') {
      return findCurrentLine(lyrics.lines, currentTime);
    }

    // plain 类型：按比例估算当前行
    if (duration > 0 && lyrics.lines.length > 1) {
      const progress = Math.min(currentTime / duration, 1);
      const idx = Math.floor(progress * lyrics.lines.length);
      return Math.min(idx, lyrics.lines.length - 1);
    }

    return -1;
  }, [lyrics, currentTime, duration]);

  // 自动滚动到当前行（居中）
  useEffect(() => {
    if (activeIndex < 0 || !scrollRef.current || !activeLineRef.current) return;
    const container = scrollRef.current;
    const line = activeLineRef.current;
    const containerHeight = container.clientHeight;
    const lineTop = line.offsetTop;
    const lineHeight = line.offsetHeight;
    const scrollTo = lineTop - containerHeight / 2 + lineHeight / 2;
    container.scrollTo({ top: scrollTo, behavior: 'smooth' });
  }, [activeIndex]);

  // 无歌词
  if (!lyrics || lyrics.lines.length === 0) {
    return (
      <div className="lyrics-panel">
        <div className="lyrics-scroll">
          <div className="lyrics-empty">
            <div className="lyrics-empty-icon">♪</div>
            <span className="text-muted">暂无嵌入歌词</span>
            <span className="text-muted" style={{ fontSize: 12 }}>支持 USLT/SYLT/Vorbis/LRC 格式</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics-panel">
      <div className="lyrics-scroll" ref={scrollRef}>
        {/* 顶部留白，让第一行可以居中 */}
        <div style={{ height: '40%' }} />

        <div className="lyrics-list">
          {lyrics.lines.map((line, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={index}
                ref={isActive ? activeLineRef : null}
                className={`lyrics-line ${isActive ? 'active' : ''}`}
              >
                {line.text}
              </div>
            );
          })}
        </div>

        {/* 底部留白 */}
        <div style={{ height: '40%' }} />
      </div>
    </div>
  );
}
