// ===== Zustand 全局状态管理 =====
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Track, Playlist, ParsedLyrics, ResonanceLevel } from '../lib/api';

// ---------- 类型别名 ----------
export type View = 'library' | 'playlist' | 'recent' | 'frequent';
export type LibraryMode = 'filename' | 'album' | 'folder';
export type PlayMode = 'sequence' | 'shuffle' | 'repeat-one';
export type SortOrder = 'asc' | 'desc';

const savedBoolean = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
};

const resonanceUpdateGeneration = new Map<number, number>();
const updateTrackResonance = (track: Track, id: number, resonance: ResonanceLevel): Track =>
  track.id === id ? { ...track, resonance } : track;

interface AppState {
  // ===== 库数据 =====
  tracks: Track[];
  sortBy: string;
  sortOrder: SortOrder;
  searchQuery: string;
  selectedTrackIds: Set<number>;
  _lastSelectedId: number | null;

  // ===== 播放清单 =====
  playlists: Playlist[];
  currentPlaylistId: number | null;
  playlistTracks: Track[];

  // ===== 播放状态 =====
  currentTrack: Track | null;
  playQueue: Track[];
  playQueueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playMode: PlayMode;

  // ===== 歌词 =====
  lyrics: ParsedLyrics | null;

  // ===== 封面 =====
  coverArt: string | null;

  // ===== UI =====
  view: View;
  libraryMode: LibraryMode;
  showEq: boolean;
  showLyrics: boolean;
  showBatchTag: boolean;
  immersiveMode: boolean;
  reactiveMotionEnabled: boolean;
  crossfadeEnabled: boolean;
  loudnessBalanceEnabled: boolean;

  // ===== Actions: 库 =====
  setTracks: (tracks: Track[]) => void;
  refreshLibrary: () => Promise<void>;
  setSortBy: (field: string) => void;
  setTrackResonance: (trackId: number, resonance: ResonanceLevel) => Promise<void>;
  setSearchQuery: (query: string) => void;

  // ===== Actions: 选择 =====
  selectTrack: (id: number, additive: boolean) => void;
  selectRange: (fromId: number, toId: number, allIds: number[]) => void;
  clearSelection: () => void;

  // ===== Actions: 播放清单 =====
  setPlaylists: (playlists: Playlist[]) => void;
  setCurrentPlaylistId: (id: number | null) => void;
  setPlaylistTracks: (tracks: Track[]) => void;

  // ===== Actions: 播放 =====
  playTrack: (track: Track, queue: Track[]) => void;
  setCurrentTrack: (track: Track | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (v: number) => void;
  setPlayMode: (mode: PlayMode) => void;
  cyclePlayMode: () => void;
  playNext: () => void;
  playPrev: () => void;
  playFromQueueIndex: (index: number) => void;

  // ===== Actions: 歌词 =====
  setLyrics: (lyrics: ParsedLyrics | null) => void;
  setCoverArt: (coverArt: string | null) => void;

  // ===== Actions: UI =====
  setView: (view: View) => void;
  setLibraryMode: (mode: LibraryMode) => void;
  toggleEq: () => void;
  toggleLyrics: () => void;
  setShowBatchTag: (show: boolean) => void;
  setImmersiveMode: (enabled: boolean) => void;
  setReactiveMotionEnabled: (enabled: boolean) => void;
  setCrossfadeEnabled: (enabled: boolean) => void;
  setLoudnessBalanceEnabled: (enabled: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // ===== 初始状态 =====
  tracks: [],
  sortBy: 'file_name',
  sortOrder: 'asc',
  searchQuery: '',
  selectedTrackIds: new Set<number>(),
  _lastSelectedId: null,

  playlists: [],
  currentPlaylistId: null,
  playlistTracks: [],

  currentTrack: null,
  playQueue: [],
  playQueueIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  playMode: 'sequence',

  lyrics: null,
  coverArt: null,

  view: 'library',
  libraryMode: 'filename',
  showEq: false,
  showLyrics: false,
  showBatchTag: false,
  immersiveMode: false,
  reactiveMotionEnabled: typeof window === 'undefined'
    ? true
    : typeof window.matchMedia === 'function'
      ? !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true,
  crossfadeEnabled: savedBoolean('lumen.crossfade', true),
  loudnessBalanceEnabled: savedBoolean('lumen.loudness-balance', true),

  // ===== Actions: 库 =====
  setTracks: (tracks) => set({ tracks }),

  refreshLibrary: async () => {
    try {
      const tracks = await api.library.query({});
      set({ tracks });
    } catch (e) {
      console.error('刷新音乐库失败:', e);
    }
  },

  setSortBy: (field) =>
    set((state) => {
      if (state.sortBy === field) {
        return { sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      return { sortBy: field, sortOrder: 'asc' };
    }),

  setTrackResonance: async (trackId, resonance) => {
    const generation = (resonanceUpdateGeneration.get(trackId) ?? 0) + 1;
    resonanceUpdateGeneration.set(trackId, generation);
    const before = get();
    const previous = {
      tracks: before.tracks.find((track) => track.id === trackId)?.resonance,
      playlistTracks: before.playlistTracks.find((track) => track.id === trackId)?.resonance,
      playQueue: before.playQueue.find((track) => track.id === trackId)?.resonance,
      currentTrack: before.currentTrack?.id === trackId ? before.currentTrack.resonance : undefined,
    };
    set((state) => ({
      tracks: state.tracks.map((track) => updateTrackResonance(track, trackId, resonance)),
      playlistTracks: state.playlistTracks.map((track) => updateTrackResonance(track, trackId, resonance)),
      playQueue: state.playQueue.map((track) => updateTrackResonance(track, trackId, resonance)),
      currentTrack: state.currentTrack
        ? updateTrackResonance(state.currentTrack, trackId, resonance)
        : null,
    }));
    try {
      await api.library.updateResonance(trackId, resonance);
    } catch (error) {
      if (resonanceUpdateGeneration.get(trackId) === generation) {
        set((state) => ({
          tracks: previous.tracks === undefined ? state.tracks : state.tracks.map(
            (track) => updateTrackResonance(track, trackId, previous.tracks!),
          ),
          playlistTracks: previous.playlistTracks === undefined ? state.playlistTracks : state.playlistTracks.map(
            (track) => updateTrackResonance(track, trackId, previous.playlistTracks!),
          ),
          playQueue: previous.playQueue === undefined ? state.playQueue : state.playQueue.map(
            (track) => updateTrackResonance(track, trackId, previous.playQueue!),
          ),
          currentTrack: state.currentTrack && previous.currentTrack !== undefined
            ? updateTrackResonance(state.currentTrack, trackId, previous.currentTrack)
            : state.currentTrack,
        }));
      }
      throw error;
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  // ===== Actions: 选择 =====
  selectTrack: (id, additive) =>
    set((state) => {
      const newSet = new Set(state.selectedTrackIds);
      if (additive) {
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      } else {
        newSet.clear();
        newSet.add(id);
      }
      return { selectedTrackIds: newSet, _lastSelectedId: id };
    }),

  selectRange: (fromId, toId, allIds) =>
    set((state) => {
      const fromIdx = allIds.indexOf(fromId);
      const toIdx = allIds.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return state;
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const newSet = new Set(state.selectedTrackIds);
      for (let i = start; i <= end; i++) {
        newSet.add(allIds[i]);
      }
      return { selectedTrackIds: newSet, _lastSelectedId: toId };
    }),

  clearSelection: () =>
    set({ selectedTrackIds: new Set<number>(), _lastSelectedId: null }),

  // ===== Actions: 播放清单 =====
  setPlaylists: (playlists) => set({ playlists }),
  setCurrentPlaylistId: (id) => set({ currentPlaylistId: id }),
  setPlaylistTracks: (tracks) => set({ playlistTracks: tracks }),

  // ===== Actions: 播放 =====
  playTrack: (track, queue) =>
    set({
      playQueue: queue,
      playQueueIndex: Math.max(0, queue.findIndex((t) => t.id === track.id)),
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
      duration: track.duration,
      lyrics: null,
    }),

  setCurrentTrack: (track) => set({ currentTrack: track }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setCurrentTime: (time) => set({ currentTime: time }),

  setDuration: (duration) => set({ duration }),

  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),

  setPlayMode: (mode) => set({ playMode: mode }),

  cyclePlayMode: () =>
    set((state) => {
      const modes: PlayMode[] = ['sequence', 'shuffle', 'repeat-one'];
      const idx = modes.indexOf(state.playMode);
      return { playMode: modes[(idx + 1) % modes.length] };
    }),

  playFromQueueIndex: (index) =>
    set((state) => {
      const track = state.playQueue[index];
      if (!track) return state;
      return {
        playQueueIndex: index,
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
        duration: track.duration,
        lyrics: null,
      };
    }),

  playNext: () => {
    const state = get();
    if (state.playQueue.length === 0) return;
    if (state.playMode === 'shuffle') {
      const nextIdx = Math.floor(Math.random() * state.playQueue.length);
      get().playFromQueueIndex(nextIdx);
      return;
    }
    const nextIdx = state.playQueueIndex + 1;
    if (nextIdx >= state.playQueue.length) {
      // 顺序播放到末尾：停止
      set({ isPlaying: false });
      return;
    }
    get().playFromQueueIndex(nextIdx);
  },

  playPrev: () => {
    const state = get();
    if (state.playQueue.length === 0) return;
    const prevIdx =
      state.playQueueIndex - 1 < 0
        ? state.playQueue.length - 1
        : state.playQueueIndex - 1;
    get().playFromQueueIndex(prevIdx);
  },

  // ===== Actions: 歌词 =====
  setLyrics: (lyrics) => set({ lyrics }),
  setCoverArt: (coverArt) => set({ coverArt }),

  // ===== Actions: UI =====
  setView: (view) => set({ view }),
  setLibraryMode: (mode) => set({ libraryMode: mode }),
  toggleEq: () => set((state) => ({ showEq: !state.showEq })),
  toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
  setShowBatchTag: (show) => set({ showBatchTag: show }),
  setImmersiveMode: (enabled) => set({ immersiveMode: enabled }),
  setReactiveMotionEnabled: (enabled) => set({ reactiveMotionEnabled: enabled }),
  setCrossfadeEnabled: (enabled) => {
    if (typeof window !== 'undefined') window.localStorage.setItem('lumen.crossfade', String(enabled));
    set({ crossfadeEnabled: enabled });
  },
  setLoudnessBalanceEnabled: (enabled) => {
    if (typeof window !== 'undefined') window.localStorage.setItem('lumen.loudness-balance', String(enabled));
    set({ loudnessBalanceEnabled: enabled });
  },
}));
