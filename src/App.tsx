// ===== 主布局组件 =====
import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { api } from './lib/api';
import { audioEngine } from './audio/AudioEngine';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import LibraryView from './components/LibraryView';
import PlaylistView from './components/PlaylistView';
import PlayerBar from './components/PlayerBar';
import EqPanel from './components/EqPanel';
import LyricsPanel from './components/LyricsPanel';
import BatchTagEditor from './components/BatchTagEditor';

export default function App() {
  // ===== 播放状态 =====
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.duration);
  const volume = useStore((s) => s.volume);
  const playMode = useStore((s) => s.playMode);

  // ===== UI 状态 =====
  const view = useStore((s) => s.view);
  const showEq = useStore((s) => s.showEq);
  const showLyrics = useStore((s) => s.showLyrics);
  const showBatchTag = useStore((s) => s.showBatchTag);
  const coverArt = useStore((s) => s.coverArt);
  const selectedTrackIds = useStore((s) => s.selectedTrackIds);
  const currentPlaylistId = useStore((s) => s.currentPlaylistId);

  // ===== Actions =====
  const setTracks = useStore((s) => s.setTracks);
  const setPlaylists = useStore((s) => s.setPlaylists);
  const setPlaylistTracks = useStore((s) => s.setPlaylistTracks);
  const setVolume = useStore((s) => s.setVolume);
  const cyclePlayMode = useStore((s) => s.cyclePlayMode);
  const toggleEq = useStore((s) => s.toggleEq);
  const toggleLyrics = useStore((s) => s.toggleLyrics);
  const setShowBatchTag = useStore((s) => s.setShowBatchTag);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const playNext = useStore((s) => s.playNext);
  const playPrev = useStore((s) => s.playPrev);

  // ===== 初始化 AudioEngine 回调（仅一次） =====
  useEffect(() => {
    // 时间更新
    audioEngine.onTimeUpdate((time) => {
      useStore.getState().setCurrentTime(time);
    });

    // 元数据加载（获取时长）
    audioEngine.onLoadedMetadata((dur) => {
      useStore.getState().setDuration(dur);
    });

    // 播放结束 → 根据 playMode 处理
    audioEngine.onEnded(() => {
      const store = useStore.getState();
      if (store.playMode === 'repeat-one') {
        audioEngine.seek(0);
        audioEngine.play();
        return;
      }
      store.playNext();
    });

    // 播放状态同步（防止浏览器自动暂停等异常）
    audioEngine.onPlayStateChange((playing) => {
      if (useStore.getState().isPlaying !== playing) {
        useStore.getState().setIsPlaying(playing);
      }
    });
  }, []);

  // ===== 当前曲目变化 → 加载 + 播放 + 加载歌词 =====
  const currentTrackId = currentTrack?.id ?? null;
  useEffect(() => {
    if (currentTrackId === null) return;

    // 异步获取可播放 URL（convertFileSrc）
    api.streamUrl(currentTrackId)
      .then((url) => {
        // 确保仍是当前曲目
        if (useStore.getState().currentTrack?.id === currentTrackId) {
          audioEngine.load(url);
          if (useStore.getState().isPlaying) {
            audioEngine.play();
          }
        }
      })
      .catch((err) => {
        console.error('加载音频失败:', err);
      });

    // 加载歌词
    api.library
      .getLyrics(currentTrackId)
      .then((lyrics) => {
        if (useStore.getState().currentTrack?.id === currentTrackId) {
          useStore.getState().setLyrics(lyrics);
        }
      })
      .catch(() => {
        useStore.getState().setLyrics(null);
      });

    // 加载封面
    api.library
      .getTrackTags(currentTrackId)
      .then((tags) => {
        if (useStore.getState().currentTrack?.id === currentTrackId) {
          useStore.getState().setCoverArt(tags.cover_art);
        }
      })
      .catch(() => {
        // 无封面时清空
      });
  }, [currentTrackId]);

  // ===== isPlaying 变化 → play / pause =====
  useEffect(() => {
    if (isPlaying) {
      audioEngine.play();
    } else {
      audioEngine.pause();
    }
  }, [isPlaying]);

  // ===== 音量同步 =====
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // ===== 初始加载库和播放清单 =====
  useEffect(() => {
    api.library
      .query({})
      .then(setTracks)
      .catch((e) => console.error('加载音乐库失败:', e));
    api.playlist
      .list()
      .then(setPlaylists)
      .catch((e) => console.error('加载播放清单失败:', e));
  }, [setTracks, setPlaylists]);

  // ===== 控制函数 =====
  const handleTogglePlay = () => setIsPlaying(!isPlaying);
  const handleSeek = (time: number) => {
    audioEngine.seek(time);
    useStore.getState().setCurrentTime(time);
  };

  // 标签更新后刷新数据
  const handleTagsUpdated = async () => {
    if (view === 'library') {
      const t = await api.library.query({});
      setTracks(t);
    } else if (currentPlaylistId !== null) {
      const t = await api.playlist.getTracks(currentPlaylistId);
      setPlaylistTracks(t);
    }
  };

  return (
    <>
      {/* 标题栏 */}
      <TitleBar />

      {/* 主体三栏 */}
      <div className="app-body">
        <Sidebar />

        <main className="app-main">
          {view === 'library' ? <LibraryView /> : <PlaylistView />}
        </main>

        {/* 浮层面板（EQ 或歌词） */}
        {(showEq || showLyrics) && (
          <aside className="app-drawer">
            {showEq ? <EqPanel /> : <LyricsPanel />}
          </aside>
        )}
      </div>

      {/* 底部播放控制栏 */}
      <PlayerBar
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        title={currentTrack?.title ?? currentTrack?.file_name ?? null}
        artist={currentTrack?.artist ?? null}
        album={currentTrack?.album ?? null}
        coverArt={coverArt}
        lyricsActive={showLyrics}
        eqActive={showEq}
        playMode={playMode}
        onTogglePlay={handleTogglePlay}
        onNext={playNext}
        onPrev={playPrev}
        onSeek={handleSeek}
        onVolumeChange={setVolume}
        onToggleLyrics={toggleLyrics}
        onToggleEq={toggleEq}
        onCyclePlayMode={cyclePlayMode}
      />

      {/* 批量标签编辑器 */}
      {showBatchTag && selectedTrackIds.size > 0 && (
        <BatchTagEditor
          onClose={() => setShowBatchTag(false)}
          onUpdated={handleTagsUpdated}
        />
      )}
    </>
  );
}
