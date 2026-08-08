// ===== 音乐库主视图（文件名/专辑/文件夹三种模式） =====
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import type { Track, Playlist } from '../lib/api';
import { folderQueue, sortAlbumQueue } from '../library/contextQueue';
import { trackDisplayTitle } from '../library/resonance';
import ResonanceMark from './ResonanceMark';

// ---------- 工具函数 ----------

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getSortValue(track: Track, field: string): string | number {
  switch (field) {
    case 'file_name': return track.file_name.toLowerCase();
    case 'title': return (track.title ?? '').toLowerCase();
    case 'album': return (track.album ?? '').toLowerCase();
    case 'artist': return (track.artist ?? '').toLowerCase();
    case 'duration': return track.duration;
    case 'folder_path':
      // 只取最后一级目录名排序，避免同目录文件被完整路径打散
      if (track.folder_path) {
        const parts = track.folder_path.split(/[/\\]/).filter(Boolean);
        return parts[parts.length - 1]?.toLowerCase() ?? '';
      }
      return '';
    default: return track.file_name.toLowerCase();
  }
}

// ---------- 专辑分组类型 ----------
interface AlbumGroup { key: string; album: string; artist: string; tracks: Track[]; }

// ---------- 文件夹树类型 ----------
interface TreeNode { name: string; fullPath: string; children: Map<string, TreeNode>; tracks: Track[]; }

function buildFolderTree(tracks: Track[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', children: new Map(), tracks: [] };
  for (const track of tracks) {
    const folderPath = track.folder_path ?? '';
    const parts = folderPath.split(/[/\\]/).filter(Boolean);
    let current = root;
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, fullPath: path, children: new Map(), tracks: [] });
      }
      current = current.children.get(part)!;
    }
    current.tracks.push(track);
  }
  return root;
}

// ============================================================
// 主组件
// ============================================================
export default function LibraryView() {
  const tracks = useStore((s) => s.tracks);
  const view = useStore((s) => s.view);
  const libraryMode = useStore((s) => s.libraryMode);
  const searchQuery = useStore((s) => s.searchQuery);
  const sortBy = useStore((s) => s.sortBy);
  const sortOrder = useStore((s) => s.sortOrder);
  const selectedTrackIds = useStore((s) => s.selectedTrackIds);
  const _lastSelectedId = useStore((s) => s._lastSelectedId);
  const currentTrack = useStore((s) => s.currentTrack);
  const playlists = useStore((s) => s.playlists);

  const setSortBy = useStore((s) => s.setSortBy);
  const setTrackResonance = useStore((s) => s.setTrackResonance);
  const selectTrack = useStore((s) => s.selectTrack);
  const selectRange = useStore((s) => s.selectRange);
  const clearSelection = useStore((s) => s.clearSelection);
  const playTrack = useStore((s) => s.playTrack);
  const setShowBatchTag = useStore((s) => s.setShowBatchTag);
  const refreshLibrary = useStore((s) => s.refreshLibrary);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // 防抖搜索
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // 过滤 + 排序
  const visibleTracks = useMemo(() => {
    let result = tracks;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter(t =>
        t.file_name.toLowerCase().includes(q) ||
        (t.title?.toLowerCase().includes(q) ?? false) ||
        (t.artist?.toLowerCase().includes(q) ?? false) ||
        (t.album?.toLowerCase().includes(q) ?? false)
      );
    }
    if (view === 'recent' || view === 'frequent') return [...result];
    const dir = sortOrder === 'asc' ? 1 : -1;
    return [...result].sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [tracks, debouncedSearch, sortBy, sortOrder, view]);

  const visibleIds = useMemo(() => visibleTracks.map(t => t.id), [visibleTracks]);
  const nowPlayingId = currentTrack?.id ?? null;

  // 行点击
  const handleRowClick = (e: React.MouseEvent, track: Track) => {
    if (e.shiftKey && _lastSelectedId !== null) {
      selectRange(_lastSelectedId, track.id, visibleIds);
    } else if (e.ctrlKey || e.metaKey) {
      selectTrack(track.id, true);
    } else {
      selectTrack(track.id, false);
    }
  };

  // 双击播放 —— 直接播放，不依赖播放清单
  const handleDoubleClick = useCallback((track: Track, queue: Track[] = visibleTracks) => {
    playTrack(track, queue);
  }, [playTrack, visibleTracks]);

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, track });
  };

  // 右键播放
  const handleContextPlay = () => {
    if (!contextMenu) return;
    handleDoubleClick(contextMenu.track);
    setContextMenu(null);
  };

  // 添加到播放清单
  const handleAddToPlaylist = async (pl: Playlist) => {
    setShowAddMenu(false);
    const ids = contextMenu
      ? [contextMenu.track.id]
      : [...selectedTrackIds];
    setContextMenu(null);
    try {
      await api.playlist.addTracks(pl.id, ids);
      const currentId = useStore.getState().currentPlaylistId;
      if (currentId === pl.id) {
        const t = await api.playlist.getTracks(pl.id);
        useStore.getState().setPlaylistTracks(t);
      }
    } catch (e) {
      console.error('添加到播放清单失败:', e);
    }
  };

  // 删除曲目
  const handleDelete = async (deleteFiles: boolean) => {
    const ids = contextMenu
      ? [contextMenu.track.id]
      : [...selectedTrackIds];
    setContextMenu(null);

    const msg = deleteFiles
      ? `确认删除 ${ids.length} 首曲目？文件也会从磁盘删除，此操作不可撤销。`
      : `确认从音乐库中移除 ${ids.length} 首曲目？（不会删除文件）`;
    if (!window.confirm(msg)) return;

    try {
      await api.library.deleteTracks(ids, deleteFiles);
      await refreshLibrary();
      clearSelection();
    } catch (e) {
      console.error('删除失败:', e);
      alert('删除失败: ' + String(e));
    }
  };

  // 列定义
  const columns = [
    { key: 'title', label: '标题', className: 'col-title' },
    { key: 'artist', label: '艺术家', className: 'col-artist' },
    { key: 'album', label: '专辑', className: 'col-album' },
    { key: 'folder_path', label: '文件夹', className: 'col-folder' },
    { key: 'duration', label: '时长', className: 'col-duration' },
  ];

  const sortIndicator = (field: string): string =>
    sortBy === field ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

  // 点击空白关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // ===== 文件名模式：表格 =====
  if (libraryMode === 'filename') {
    return (
      <div className="library-view">
        {/* 工具栏（常驻显示） */}
        <div className="library-toolbar">
          <span className="library-track-count text-muted">
            {view === 'recent' ? '最近播放' : view === 'frequent' ? '常听' : `共 ${visibleTracks.length} 首`}
            {(view === 'recent' || view === 'frequent') ? ` · ${visibleTracks.length} 首` : ''}
            {searchQuery ? ` · 搜索 "${searchQuery}"` : ''}
          </span>
          <div className="library-toolbar-right">
            {/* 选中时显示操作按钮 */}
            {selectedTrackIds.size > 0 && (
              <>
                <button className="primary" onClick={() => setShowBatchTag(true)}>
                  编辑标签 ({selectedTrackIds.size})
                </button>
                <div className="add-menu-wrapper">
                  <button className="primary" onClick={() => setShowAddMenu(!showAddMenu)}>
                    添加到播放清单 ▾
                  </button>
                  {showAddMenu && (
                    <div className="add-menu glass-panel-strong" onClick={(e) => e.stopPropagation()}>
                      {playlists.length === 0 ? (
                        <div className="add-menu-empty text-muted">暂无播放清单，请先在左侧创建</div>
                      ) : (
                        playlists.map(pl => (
                          <button key={pl.id} className="add-menu-item" onClick={() => handleAddToPlaylist(pl)}>
                            ♪ {pl.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="danger-btn"
                  onClick={() => handleDelete(false)}
                  title="从音乐库移除（不删除文件）"
                >
                  移除
                </button>
                <button
                  className="danger-btn"
                  onClick={() => handleDelete(true)}
                  title="删除文件（不可撤销）"
                >
                  删除文件
                </button>
                <button onClick={clearSelection}>取消选择</button>
              </>
            )}
          </div>
        </div>

        {/* 表头 */}
        <div className="track-table">
          <div className="track-header">
            {columns.map(col => (
              <div
                key={col.key}
                className={`track-header-cell ${col.className} ${sortBy === col.key ? 'active' : ''}`}
                onClick={() => setSortBy(col.key)}
              >
                {col.label}{sortIndicator(col.key)}
              </div>
            ))}
          </div>

          {/* 曲目行 */}
          <div className="track-body" onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}>
            {visibleTracks.length === 0 ? (
              <div className="empty-state text-muted">
                {tracks.length === 0 ? '点击左下角「＋ 添加文件夹」导入音乐' : '无匹配结果'}
              </div>
            ) : visibleTracks.map(track => (
              <div
                key={track.id}
                className={`track-row list-row ${selectedTrackIds.has(track.id) ? 'selected' : ''} ${nowPlayingId === track.id ? 'playing' : ''}`}
                onClick={(e) => handleRowClick(e, track)}
                onDoubleClick={() => handleDoubleClick(track)}
                onContextMenu={(e) => handleContextMenu(e, track)}
              >
                <div className="track-cell col-title" title={trackDisplayTitle(track)}>
                  <ResonanceMark
                    level={track.resonance}
                    onChange={(level) => {
                      setTrackResonance(track.id, level).catch((error) => {
                        console.error('保存共鸣评价失败:', error);
                        window.alert('评价保存失败，请重试');
                      });
                    }}
                  />
                  <span className="truncate">{trackDisplayTitle(track)}</span>
                </div>
                <div className="track-cell col-artist truncate" title={track.artist ?? ''}>{track.artist || '—'}</div>
                <div className="track-cell col-album truncate" title={track.album ?? ''}>{track.album || '—'}</div>
                <div className="track-cell col-folder truncate text-muted" title={track.folder_path ?? ''}>
                  {track.folder_path ? track.folder_path.split(/[/\\]/).pop() : '—'}
                </div>
                <div className="track-cell col-duration text-muted">{formatDuration(track.duration)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右键上下文菜单 */}
        {contextMenu && (
          <div className="track-context-menu glass-panel-strong" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <button className="track-context-item" onClick={handleContextPlay}>
              ▶ 立即播放
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
            <span className="text-muted" style={{ padding: '4px 12px', fontSize: 12 }}>添加到播放清单</span>
            {playlists.length === 0 ? (
              <div className="text-muted" style={{ padding: '4px 12px', fontSize: 12 }}>暂无播放清单</div>
            ) : playlists.map(pl => (
              <button key={pl.id} className="track-context-item" onClick={() => handleAddToPlaylist(pl)}>
                ♪ {pl.name}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
            <button className="track-context-item track-context-danger" onClick={() => handleDelete(false)}>
              ✕ 从音乐库移除
            </button>
            <button className="track-context-item track-context-danger" onClick={() => handleDelete(true)}>
              🗑 删除文件
            </button>
          </div>
        )}
      </div>
    );
  }

  // ===== 专辑模式 =====
  if (libraryMode === 'album') {
    return <AlbumMode tracks={visibleTracks} nowPlayingId={nowPlayingId} onPlay={handleDoubleClick} />;
  }

  // ===== 文件夹模式 =====
  return <FolderMode tracks={visibleTracks} nowPlayingId={nowPlayingId} onPlay={handleDoubleClick} />;
}

// ============================================================
// 专辑分组模式
// ============================================================
function AlbumMode({ tracks, nowPlayingId, onPlay }: { tracks: Track[]; nowPlayingId: number | null; onPlay: (track: Track, queue: Track[]) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const albums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, AlbumGroup>();
    for (const t of tracks) {
      const album = t.album || '未知专辑';
      const artist = t.album_artist || t.artist || '未知艺术家';
      const key = `${artist}\u0000${album}`;
      if (!map.has(key)) map.set(key, { key, album, artist, tracks: [] });
      map.get(key)!.tracks.push(t);
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
  }, [tracks]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  };

  if (tracks.length === 0) return <div className="empty-state text-muted">无匹配结果</div>;

  return (
    <div className="album-view">
      <div className="album-list">
        {albums.map(album => {
          const isExpanded = expanded.has(album.key);
          const albumQueue = sortAlbumQueue(album.tracks);
          return (
            <div key={album.key} className="album-group">
              <div className="album-header list-row" onClick={() => toggleExpand(album.key)}>
                <span className="album-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                <div className="album-cover">
                  <svg width="32" height="32" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" />
                    <circle cx="16" cy="16" r="4" fill="var(--accent)" opacity="0.6" />
                    <circle cx="16" cy="16" r="1" fill="var(--bg)" />
                  </svg>
                </div>
                <div className="album-info">
                  <div className="album-name truncate">{album.album}</div>
                  <div className="album-meta text-muted">{album.artist} · {album.tracks.length} 首</div>
                </div>
              </div>
              {isExpanded && (
                <div className="album-tracks">
                  {albumQueue.map(track => (
                    <div
                      key={track.id}
                      className={`album-track list-row ${nowPlayingId === track.id ? 'playing' : ''}`}
                      onDoubleClick={() => onPlay(track, albumQueue)}
                    >
                      <span className="album-track-no text-muted">{track.track_no ?? '–'}</span>
                      <span className="album-track-title truncate">{track.title || track.file_name}</span>
                      <span className="album-track-duration text-muted">{formatDuration(track.duration)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 文件夹树模式
// ============================================================
function FolderMode({ tracks, nowPlayingId, onPlay }: { tracks: Track[]; nowPlayingId: number | null; onPlay: (track: Track, queue: Track[]) => void }) {
  const tree = useMemo(() => buildFolderTree(tracks), [tracks]);
  if (tracks.length === 0) return <div className="empty-state text-muted">无匹配结果</div>;
  return (
    <div className="folder-view">
      <div className="folder-list">
        <FolderNode node={tree} depth={0} nowPlayingId={nowPlayingId} onPlay={onPlay} />
      </div>
    </div>
  );
}

function FolderNode({ node, depth, nowPlayingId, onPlay }: { node: TreeNode; depth: number; nowPlayingId: number | null; onPlay: (track: Track, queue: Track[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const childNodes = useMemo(() => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)), [node.children]);
  const hasChildren = childNodes.length > 0;
  const hasTracks = node.tracks.length > 0;
  const canExpand = hasChildren || hasTracks;

  if (node.name === '') {
    return (<>{childNodes.map(child => <FolderNode key={child.fullPath} node={child} depth={depth} nowPlayingId={nowPlayingId} onPlay={onPlay} />)}</>);
  }

  return (
    <div className="folder-node">
      <div className="folder-header list-row" style={{ paddingLeft: `${depth * 16 + 8}px` }} onClick={() => canExpand && setExpanded(!expanded)}>
        <span className="folder-expand-icon">{canExpand ? (expanded ? '▾' : '▸') : ''}</span>
        <span className="folder-icon">📁</span>
        <span className="folder-name truncate">{node.name}</span>
        {hasTracks && <span className="folder-count text-muted">{node.tracks.length}</span>}
      </div>
      {expanded && (
        <div className="folder-content">
          {hasTracks && node.tracks.map(track => (
            <div
              key={track.id}
              className={`folder-track list-row ${nowPlayingId === track.id ? 'playing' : ''}`}
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              onDoubleClick={() => onPlay(track, folderQueue(node.tracks))}
            >
              <span className="folder-track-icon">♪</span>
              <span className="folder-track-title truncate">{track.title || track.file_name}</span>
              <span className="folder-track-duration text-muted">{formatDuration(track.duration)}</span>
            </div>
          ))}
          {childNodes.map(child => (
            <FolderNode key={child.fullPath} node={child} depth={depth + 1} nowPlayingId={nowPlayingId} onPlay={onPlay} />
          ))}
        </div>
      )}
    </div>
  );
}
