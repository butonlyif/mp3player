// ===== 左侧导航栏 =====
import { useEffect, useState, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore, type LibraryMode } from '../store/useStore';
import { api } from '../lib/api';
import type { Playlist } from '../lib/api';

export default function Sidebar() {
  // 状态
  const libraryMode = useStore((s) => s.libraryMode);
  const view = useStore((s) => s.view);
  const searchQuery = useStore((s) => s.searchQuery);
  const playlists = useStore((s) => s.playlists);
  const currentPlaylistId = useStore((s) => s.currentPlaylistId);

  // Actions
  const setLibraryMode = useStore((s) => s.setLibraryMode);
  const setView = useStore((s) => s.setView);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const setPlaylists = useStore((s) => s.setPlaylists);
  const setCurrentPlaylistId = useStore((s) => s.setCurrentPlaylistId);
  const setPlaylistTracks = useStore((s) => s.setPlaylistTracks);
  const setTracks = useStore((s) => s.setTracks);
  const refreshLibrary = useStore((s) => s.refreshLibrary);

  const [busy, setBusy] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const memoryRequest = useRef(0);

  // 监听扫描进度事件
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const p1 = listen<{ current: number; total: number }>('scan:progress', (event) => {
      const { current, total } = event.payload;
      setScanInfo(`扫描中 ${current}/${total}`);
    }).then((fn) => { unlisteners.push(fn); });
    void p1;

    const p2 = listen<{ scanned: number; error?: string }>('scan:done', () => {
      setScanInfo(null);
      // 扫描完成后刷新库
      refreshLibrary();
    }).then((fn) => { unlisteners.push(fn); });
    void p2;

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  // 点击空白处关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // 刷新播放清单
  const refreshPlaylists = useCallback(async () => {
    try {
      const list = await api.playlist.list();
      setPlaylists(list);
    } catch (e) {
      console.error('查询播放清单失败:', e);
    }
  }, [setPlaylists]);

  // 添加文件夹
  const handleAddFolder = async () => {
    setBusy(true);
    setScanInfo('等待选择文件夹…');
    try {
      // addFolder 返回后扫描在后台进行，UI 不阻塞
      await api.library.addFolder();
      // 扫描完成由 scan:done 事件处理，此处仅标记对话框已关闭
    } catch (e) {
      console.error('添加文件夹失败:', e);
      setScanInfo(null);
    }
    setBusy(false);
  };

  // 选择播放清单
  const handleSelectPlaylist = async (id: number) => {
    setCurrentPlaylistId(id);
    setView('playlist');
    try {
      const tracks = await api.playlist.getTracks(id);
      setPlaylistTracks(tracks);
    } catch (e) {
      console.error('加载播放清单曲目失败:', e);
    }
  };

  // 创建播放清单
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await api.playlist.create(newPlaylistName.trim());
      setNewPlaylistName('');
      setCreatingPlaylist(false);
      await refreshPlaylists();
    } catch (e) {
      console.error('创建播放清单失败:', e);
    }
  };

  // 切换到音乐库视图
  const handleLibraryClick = () => {
    memoryRequest.current += 1;
    setView('library');
    refreshLibrary();
  };

  const handleMemoryClick = async (mode: 'recent' | 'frequent') => {
    const requestId = ++memoryRequest.current;
    setView(mode);
    setLibraryMode('filename');
    setSearchQuery('');
    try {
      const memoryTracks = await api.playback.queryMemory(mode);
      if (requestId === memoryRequest.current) setTracks(memoryTracks);
    } catch (e) {
      console.error('加载听歌记忆失败:', e);
    }
  };

  // 右键菜单
  const handlePlaylistContextMenu = (e: React.MouseEvent, playlist: Playlist) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, playlist });
  };

  // 重命名
  const handleStartRename = (playlist: Playlist) => {
    setRenaming(playlist);
    setRenameValue(playlist.name);
    setContextMenu(null);
  };

  const handleConfirmRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    try {
      await api.playlist.rename(renaming.id, renameValue.trim());
      await refreshPlaylists();
    } catch (e) {
      console.error('重命名播放清单失败:', e);
    }
    setRenaming(null);
  };

  // 删除
  const handleDelete = async (playlist: Playlist) => {
    setContextMenu(null);
    try {
      await api.playlist.delete(playlist.id);
      if (currentPlaylistId === playlist.id) {
        setCurrentPlaylistId(null);
        setView('library');
      }
      await refreshPlaylists();
    } catch (e) {
      console.error('删除播放清单失败:', e);
    }
  };

  const modeButtons: { key: LibraryMode; label: string }[] = [
    { key: 'filename', label: '文件名' },
    { key: 'album', label: '专辑' },
    { key: 'folder', label: '文件夹' },
  ];

  return (
    <aside className="sidebar glass-panel">
      <div className="sidebar-drag" data-tauri-drag-region />

      {/* 音乐库视图切换 */}
      <div className="sidebar-section">
        <div className="sidebar-section-title text-muted">浏览模式</div>
        <div className="sidebar-mode-row">
          {modeButtons.map((btn) => (
            <button
              key={btn.key}
              className={`sidebar-mode-btn ${view === 'library' && libraryMode === btn.key ? 'active' : ''}`}
              onClick={() => {
                setView('library');
                setLibraryMode(btn.key);
                refreshLibrary();
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 音乐库入口 */}
      <div className="sidebar-section">
        <button
          className={`sidebar-nav-btn ${view === 'library' ? 'active' : ''}`}
          onClick={handleLibraryClick}
        >
          <span className="sidebar-nav-icon">♪</span>
          <span>音乐库</span>
        </button>
        <button
          className={`sidebar-nav-btn ${view === 'recent' ? 'active' : ''}`}
          onClick={() => handleMemoryClick('recent')}
        >
          <span className="sidebar-nav-icon">◷</span>
          <span>最近播放</span>
        </button>
        <button
          className={`sidebar-nav-btn ${view === 'frequent' ? 'active' : ''}`}
          onClick={() => handleMemoryClick('frequent')}
        >
          <span className="sidebar-nav-icon">↟</span>
          <span>常听</span>
        </button>
        <input
          type="search"
          className="sidebar-search"
          placeholder="搜索…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 播放清单 */}
      <div className="sidebar-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-section-title text-muted">播放清单</div>
        <div className="sidebar-playlists">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className={`sidebar-playlist-item ${view === 'playlist' && currentPlaylistId === pl.id ? 'active' : ''}`}
              onClick={() => handleSelectPlaylist(pl.id)}
              onContextMenu={(e) => handlePlaylistContextMenu(e, pl)}
            >
              <span className="sidebar-playlist-icon">♪</span>
              <span className="truncate">{pl.name}</span>
            </button>
          ))}
          {playlists.length === 0 && !creatingPlaylist && (
            <div className="sidebar-playlist-empty text-muted">暂无播放清单</div>
          )}
        </div>

        {creatingPlaylist ? (
          <div className="sidebar-create-row">
            <input
              type="text"
              className="sidebar-create-input"
              placeholder="播放清单名称"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreatePlaylist();
                if (e.key === 'Escape') {
                  setCreatingPlaylist(false);
                  setNewPlaylistName('');
                }
              }}
              autoFocus
            />
            <button className="primary" onClick={handleCreatePlaylist}>✓</button>
            <button onClick={() => { setCreatingPlaylist(false); setNewPlaylistName(''); }}>✕</button>
          </div>
        ) : (
          <button
            className="sidebar-action-btn"
            style={{ marginTop: 4 }}
            onClick={() => setCreatingPlaylist(true)}
          >
            ＋ 新建播放清单
          </button>
        )}
      </div>

      {/* 扫描进度 */}
      {scanInfo && (
        <div className="sidebar-scan-info">
          <span className="text-muted">{scanInfo}</span>
          <div className="sidebar-progress-bar">
            <div className="sidebar-progress-fill" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {/* 底部操作 */}
      <div className="sidebar-actions">
        <button className="sidebar-action-btn" onClick={handleAddFolder} disabled={busy}>
          {busy ? '处理中…' : '＋ 添加文件夹'}
        </button>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="sidebar-context-item"
            onClick={() => handleStartRename(contextMenu.playlist)}
          >
            重命名
          </button>
          <button
            className="sidebar-context-item danger"
            onClick={() => handleDelete(contextMenu.playlist)}
          >
            删除
          </button>
        </div>
      )}

      {/* 重命名对话框 */}
      {renaming && (
        <div className="rename-overlay" onClick={() => setRenaming(null)}>
          <div className="rename-dialog glass-panel-strong" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>重命名播放清单</div>
            <input
              type="text"
              className="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              autoFocus
            />
            <div className="rename-actions">
              <button onClick={() => setRenaming(null)}>取消</button>
              <button className="primary" onClick={handleConfirmRename}>确定</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
