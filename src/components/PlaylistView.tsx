// ===== 播放清单视图 =====
import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import type { Track } from '../lib/api';
import { sortByResonanceStable, trackDisplayTitle } from '../library/resonance';
import ResonanceMark from './ResonanceMark';

/** 格式化时长 */
function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 格式化总时长 */
function formatTotalDuration(secs: number): string {
  if (secs <= 0) return '0 分钟';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

export default function PlaylistView() {
  const playlistTracks = useStore((s) => s.playlistTracks);
  const playlists = useStore((s) => s.playlists);
  const currentPlaylistId = useStore((s) => s.currentPlaylistId);
  const currentTrack = useStore((s) => s.currentTrack);
  const setPlaylistTracks = useStore((s) => s.setPlaylistTracks);
  const playTrack = useStore((s) => s.playTrack);
  const sortBy = useStore((s) => s.sortBy);
  const sortOrder = useStore((s) => s.sortOrder);
  const setSortBy = useStore((s) => s.setSortBy);
  const setTrackResonance = useStore((s) => s.setTrackResonance);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: number } | null>(null);

  const currentPlaylist = useMemo(
    () => playlists.find((p) => p.id === currentPlaylistId) ?? null,
    [playlists, currentPlaylistId]
  );

  const totalDuration = useMemo(
    () => playlistTracks.reduce((sum, t) => sum + (t.duration || 0), 0),
    [playlistTracks]
  );

  const nowPlayingId = currentTrack?.id ?? null;
  const visiblePlaylistTracks = useMemo(
    () => sortBy === 'resonance'
      ? sortByResonanceStable(playlistTracks, sortOrder)
      : playlistTracks,
    [playlistTracks, sortBy, sortOrder],
  );

  // 双击播放
  const handleDoubleClick = (track: Track) => {
    playTrack(track, visiblePlaylistTracks);
  };

  // 右键菜单：移除
  const handleContextMenu = (e: React.MouseEvent, trackId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId });
  };

  // 从清单移除
  const handleRemove = async (trackId: number) => {
    setContextMenu(null);
    if (currentPlaylistId === null) return;
    try {
      await api.playlist.removeTracks(currentPlaylistId, [trackId]);
      const updated = await api.playlist.getTracks(currentPlaylistId);
      setPlaylistTracks(updated);
    } catch (e) {
      console.error('移除曲目失败:', e);
    }
  };

  // ===== 拖拽排序 =====
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = async (index: number) => {
    if (dragIndex === null || dragIndex === index || currentPlaylistId === null) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    try {
      await api.playlist.reorder(currentPlaylistId, dragIndex, index);
      const updated = await api.playlist.getTracks(currentPlaylistId);
      setPlaylistTracks(updated);
    } catch (e) {
      console.error('重新排序失败:', e);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // 点击空白关闭右键菜单
  if (contextMenu) {
    setTimeout(() => {
      const close = () => {
        setContextMenu(null);
        window.removeEventListener('click', close);
      };
      window.addEventListener('click', close);
    }, 0);
  }

  if (!currentPlaylist) {
    return <div className="playlist-empty text-muted">未选择播放清单</div>;
  }

  return (
    <div className="playlist-view">
      {/* 头部信息 */}
      <div className="playlist-header">
        <span className="playlist-title">{currentPlaylist.name}</span>
        <span className="playlist-stats text-muted">
          {playlistTracks.length} 首 · {formatTotalDuration(totalDuration)}
        </span>
        <button
          type="button"
          className={`playlist-resonance-sort ${sortBy === 'resonance' ? 'active' : ''}`}
          onClick={() => setSortBy('resonance')}
          title="按私人共鸣排序"
        >
          共鸣{sortBy === 'resonance' ? (sortOrder === 'desc' ? ' ▼' : ' ▲') : ''}
        </button>
      </div>

      {/* 曲目列表 */}
      <div className="playlist-body">
        {playlistTracks.length === 0 ? (
          <div className="playlist-empty text-muted">
            播放清单为空，从音乐库添加曲目
          </div>
        ) : (
          visiblePlaylistTracks.map((track, index) => (
            <div
              key={track.id}
              className={`playlist-row list-row ${
                nowPlayingId === track.id ? 'playing' : ''
              } ${dragIndex === index ? 'dragging' : ''} ${
                dragOverIndex === index && dragIndex !== null ? 'drag-over' : ''
              }`}
              draggable={sortBy !== 'resonance'}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              onDoubleClick={() => handleDoubleClick(track)}
              onContextMenu={(e) => handleContextMenu(e, track.id)}
            >
              <div className="pl-cell pl-cell-index text-muted">{index + 1}</div>
              <div className="pl-cell pl-cell-resonance">
                <ResonanceMark
                  level={track.resonance}
                  onChange={(level) => setTrackResonance(track.id, level).catch(() => window.alert('评价保存失败，请重试'))}
                />
              </div>
              <div className="pl-cell pl-cell-title truncate" title={trackDisplayTitle(track)}>
                {trackDisplayTitle(track)}
              </div>
              <div className="pl-cell pl-cell-artist truncate text-muted" title={track.artist ?? ''}>
                {track.artist || '—'}
              </div>
              <div className="pl-cell pl-cell-album truncate text-muted" title={track.album ?? ''}>
                {track.album || '—'}
              </div>
              <div className="pl-cell pl-cell-duration text-muted">
                {formatDuration(track.duration)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="sidebar-context-item danger"
            onClick={() => handleRemove(contextMenu.trackId)}
          >
            从清单移除
          </button>
        </div>
      )}
    </div>
  );
}
