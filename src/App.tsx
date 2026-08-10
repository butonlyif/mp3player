// ===== 主布局组件 =====
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store/useStore';
import { api } from './lib/api';
import { audioEngine } from './audio/AudioEngine';
import { loadTrackRequest } from './audio/loadTrackRequest';
import { AudioReactiveAnalyzer } from './audio/reactiveAnalysis';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import LibraryView from './components/LibraryView';
import PlaylistView from './components/PlaylistView';
import PlayerBar from './components/PlayerBar';
import EqPanel from './components/EqPanel';
import LyricsPanel from './components/LyricsPanel';
import BatchTagEditor from './components/BatchTagEditor';
import ImmersiveVisualizer from './components/ImmersiveVisualizer';
import AppShell from './components/AppShell';
import { extractCoverPalette, fallbackPalette } from './visualizer/palette';
import { getImmersiveLyrics, stripAudioExtension } from './visualizer/trackPresentation';
import { usePlaybackShortcuts } from './keyboard/usePlaybackShortcuts';
import { usePlaybackMemory } from './listening/usePlaybackMemory';
import { adaptiveCrossfadeSeconds } from './audio/continuousListening';
import { tuneMagicPillPalette } from './magicPill/palette';
import { createMagicPillController } from './magicPill/controller';
import { createTauriMagicPillPlatform } from './magicPill/tauriAdapter';
import { useMagicPillBridge } from './magicPill/useMagicPillBridge';

export default function App() {
  // ===== 播放状态 =====
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.duration);
  const volume = useStore((s) => s.volume);
  const playMode = useStore((s) => s.playMode);
  const currentTrackId = currentTrack?.id ?? null;

  // ===== UI 状态 =====
  const view = useStore((s) => s.view);
  const showEq = useStore((s) => s.showEq);
  const showLyrics = useStore((s) => s.showLyrics);
  const showBatchTag = useStore((s) => s.showBatchTag);
  const coverArt = useStore((s) => s.coverArt);
  const selectedTrackIds = useStore((s) => s.selectedTrackIds);
  const currentPlaylistId = useStore((s) => s.currentPlaylistId);
  const lyrics = useStore((s) => s.lyrics);
  const immersiveMode = useStore((s) => s.immersiveMode);
  const reactiveMotionEnabled = useStore((s) => s.reactiveMotionEnabled);
  const loudnessBalanceEnabled = useStore((s) => s.loudnessBalanceEnabled);
  const crossfadeEnabled = useStore((s) => s.crossfadeEnabled);
  const playQueue = useStore((s) => s.playQueue);
  const playQueueIndex = useStore((s) => s.playQueueIndex);
  const pendingCrossfade = useRef<number | null>(null);
  const automaticTransitionTrack = useRef<number | null>(null);
  const [magicPillPalette, setMagicPillPalette] = useState<[string, string, string]>(() =>
    tuneMagicPillPalette(fallbackPalette(String(currentTrackId ?? 'peter-player'))).colors,
  );
  const magicPillController = useMemo(
    () => createMagicPillController(createTauriMagicPillPlatform()),
    [],
  );

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
  const setImmersiveMode = useStore((s) => s.setImmersiveMode);
  const setReactiveMotionEnabled = useStore((s) => s.setReactiveMotionEnabled);

  const immersiveLyrics = useMemo(
    () => getImmersiveLyrics(lyrics, currentTime, duration),
    [lyrics, currentTime, duration],
  );
  const displayTitle = stripAudioExtension(currentTrack?.title ?? currentTrack?.file_name ?? '未播放');

  // 日常模式只更新根节点 CSS 变量，不触发 React 高频渲染。
  useEffect(() => {
    const root = document.documentElement;
    const fallback = tuneMagicPillPalette(
      fallbackPalette(String(currentTrackId ?? 'peter-player')),
    );
    setMagicPillPalette(fallback.colors);
    root.style.setProperty('--ambient-color', fallback.colors[0]);
    if (!coverArt) return;
    let current = true;
    extractCoverPalette(coverArt, String(currentTrackId))
      .then((result) => {
        if (!current) return;
        const tuned = tuneMagicPillPalette(result);
        setMagicPillPalette(tuned.colors);
        root.style.setProperty('--ambient-color', tuned.colors[0]);
      })
      .catch(() => undefined);
    return () => { current = false; };
  }, [coverArt, currentTrackId]);

  useEffect(() => {
    if (!isPlaying || immersiveMode || !reactiveMotionEnabled) return;
    const root = document.documentElement;
    const analyzer = new AudioReactiveAnalyzer(
      audioEngine.frequencyBinCount, audioEngine.sampleRate, audioEngine.analyserFftSize,
    );
    const data = new Uint8Array(new ArrayBuffer(audioEngine.frequencyBinCount));
    let frameId = 0;
    let lastSample = 0;
    let active = true;
    const frame = (now: number) => {
      if (!active || document.hidden) return;
      if (now - lastSample < 50) {
        frameId = requestAnimationFrame(frame);
        return;
      }
      if (!audioEngine.getFrequencyData(data)) {
        if (audioEngine.analysisState !== 'unavailable') {
          frameId = requestAnimationFrame(frame);
        } else {
          root.style.setProperty('--ambient-scale', '1');
          root.style.setProperty('--ambient-haze-opacity', '0');
          root.style.setProperty('--ambient-glow', '4px');
        }
        return;
      }
      lastSample = now;
      const signal = analyzer.update(data, now);
      root.style.setProperty('--ambient-bass', signal.bass.toFixed(3));
      root.style.setProperty('--ambient-energy', signal.energy.toFixed(3));
      root.style.setProperty('--ambient-scale', (1 + signal.bass * 0.075).toFixed(4));
      root.style.setProperty('--ambient-haze-opacity', (0.06 + signal.energy * 0.32).toFixed(3));
      root.style.setProperty('--ambient-glow', `${(6 + signal.energy * 26).toFixed(1)}px`);
      frameId = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frameId);
      if (!document.hidden && active) {
        lastSample = 0;
        frameId = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) frameId = requestAnimationFrame(frame);
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibility);
      root.style.setProperty('--ambient-bass', '0');
      root.style.setProperty('--ambient-energy', '0');
      root.style.setProperty('--ambient-scale', '1');
      root.style.setProperty('--ambient-haze-opacity', '0');
      root.style.setProperty('--ambient-glow', '4px');
    };
  }, [immersiveMode, isPlaying, reactiveMotionEnabled, currentTrackId]);

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
  useEffect(() => {
    if (currentTrackId === null) return;
    useStore.getState().setCoverArt(null);

    // Claim this transition for this specific selection before any async work.
    const fadeSeconds = pendingCrossfade.current;
    pendingCrossfade.current = null;
    const requestController = new AbortController();

    // 异步获取可播放 URL（convertFileSrc）
    loadTrackRequest({
      trackId: currentTrackId,
      urlPromise: api.streamUrl(currentTrackId),
      fadeSeconds,
      crossfadeEnabled: () => useStore.getState().crossfadeEnabled,
      engine: audioEngine,
      signal: requestController.signal,
      isCurrent: (trackId) => useStore.getState().currentTrack?.id === trackId,
      shouldPlay: () => useStore.getState().isPlaying,
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
        if (useStore.getState().currentTrack?.id === currentTrackId) {
          useStore.getState().setCoverArt(null);
        }
      });

    return () => requestController.abort();
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

  useEffect(() => {
    audioEngine.setLoudnessBalance(loudnessBalanceEnabled);
  }, [loudnessBalanceEnabled]);

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
    const didSeek = audioEngine.seek(time);
    if (didSeek) useStore.getState().setCurrentTime(time);
    return didSeek;
  };
  const handleNext = () => {
    const canAdvance = playMode === 'shuffle' || playQueueIndex + 1 < playQueue.length;
    if (crossfadeEnabled && isPlaying && canAdvance) pendingCrossfade.current = 0.5;
    else pendingCrossfade.current = null;
    playNext();
  };
  const handlePrev = () => {
    if (crossfadeEnabled && isPlaying) pendingCrossfade.current = 0.5;
    playPrev();
  };

  useMagicPillBridge({
    controller: magicPillController,
    trackId: currentTrackId,
    title: displayTitle,
    artist: currentTrack?.artist ?? '',
    isPlaying,
    palette: magicPillPalette,
    actions: {
      previous: handlePrev,
      togglePlayback: handleTogglePlay,
      next: handleNext,
    },
  });

  usePlaybackShortcuts({
    hasTrack: currentTrack !== null,
    isPlaying,
    currentTime,
    duration,
    volume,
    immersiveMode,
    showBatchTag,
    showLyrics,
    showEq,
    setPlaying: setIsPlaying,
    seek: handleSeek,
    previous: handlePrev,
    next: handleNext,
    setVolume,
    setImmersiveMode,
    toggleLyrics,
    toggleEq,
    closeBatchTag: () => setShowBatchTag(false),
  });

  usePlaybackMemory({
    trackId: currentTrackId,
    isPlaying,
    currentTime,
    duration,
    seek: handleSeek,
  });

  useEffect(() => {
    if (!crossfadeEnabled || !isPlaying || currentTrackId === null || duration <= 0) return;
    if (currentTime < 1) automaticTransitionTrack.current = null;
    if (playMode === 'repeat-one' || playQueue.length === 0) return;
    const hasNext = playMode === 'shuffle' || playQueueIndex + 1 < playQueue.length;
    if (!hasNext) return;
    const fadeSeconds = adaptiveCrossfadeSeconds(audioEngine.tailEnergy);
    if (duration - currentTime > fadeSeconds + 0.2) return;
    if (automaticTransitionTrack.current === currentTrackId) return;
    automaticTransitionTrack.current = currentTrackId;
    pendingCrossfade.current = fadeSeconds;
    playNext();
  }, [crossfadeEnabled, currentTime, currentTrackId, duration, isPlaying, playMode, playNext, playQueue.length, playQueueIndex]);

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

  const player = (
    <PlayerBar
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        title={currentTrack ? displayTitle : null}
        artist={currentTrack?.artist ?? null}
        album={currentTrack?.album ?? null}
        coverArt={coverArt}
        lyricsActive={showLyrics}
        eqActive={showEq}
        immersiveActive={immersiveMode}
        playMode={playMode}
        onTogglePlay={handleTogglePlay}
        onNext={handleNext}
        onPrev={handlePrev}
        onSeek={handleSeek}
        onVolumeChange={setVolume}
        onToggleLyrics={toggleLyrics}
        onToggleEq={toggleEq}
        onToggleImmersive={() => setImmersiveMode(!immersiveMode)}
        onCyclePlayMode={cyclePlayMode}
    />
  );
  const overlays = (
    <>
      {showBatchTag && selectedTrackIds.size > 0 && (
        <BatchTagEditor
          onClose={() => setShowBatchTag(false)}
          onUpdated={handleTagsUpdated}
        />
      )}
    </>
  );

  return (
    <AppShell
      immersive={immersiveMode}
      titleBar={<TitleBar />}
      sidebar={<Sidebar />}
      main={<main className="app-main">{view === 'playlist' ? <PlaylistView /> : <LibraryView />}</main>}
      drawer={(showEq || showLyrics) ? <aside className="app-drawer">{showEq ? <EqPanel /> : <LyricsPanel />}</aside> : null}
      player={player}
      immersiveContent={(
        <ImmersiveVisualizer
          trackKey={String(currentTrack?.id ?? 'empty')}
          title={currentTrack ? displayTitle : '未播放'}
          lyric={immersiveLyrics.current}
          nextLyric={immersiveLyrics.next}
          coverArt={coverArt}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          motionEnabled={reactiveMotionEnabled}
          onExit={() => setImmersiveMode(false)}
          onMotionChange={setReactiveMotionEnabled}
          onTogglePlay={handleTogglePlay}
          onNext={handleNext}
          onPrev={handlePrev}
          onSeek={handleSeek}
          hasTrack={currentTrack !== null}
        />
      )}
      overlays={overlays}
    />
  );
}
