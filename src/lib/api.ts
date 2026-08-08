// ===== Tauri IPC 类型安全封装 =====
// 所有后端命令通过 invoke 调用，此处提供类型完整的 API 层
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// ---------- 类型定义 ----------

/** 曲目（原地引用：只存 path，不存文件内容） */
export interface Track {
  id: number;
  path: string;
  file_name: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  folder_path: string | null;
  genre: string | null;
  year: number | null;
  track_no: number | null;
  disc_no: number | null;
  duration: number;
  bitrate: number | null;
  sample_rate: number | null;
  has_lyrics: number;
  lyrics_type: string | null;
}

/** 播放清单 */
export interface Playlist {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

/** 曲目的完整标签（含歌词、封面） */
export interface TrackTags {
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  genre: string | null;
  year: number | null;
  track_no: number | null;
  disc_no: number | null;
  lyrics: string | null;
  cover_art: string | null; // data URI
}

/** 歌词行 */
export interface LyricLine {
  time: number | null;
  text: string;
}

/** 解析后的歌词 */
export interface ParsedLyrics {
  type: 'synced' | 'plain';
  lines: LyricLine[];
  offset?: number;
}

/** EQ 预设 */
export interface EqPreset {
  id?: number;
  name: string;
  gains: number[];
  builtin: boolean;
}

/** 查询选项 */
export interface QueryOpts {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

/** 批量标签更新请求 */
export interface BatchTagUpdate {
  trackIds: number[];
  fields: Partial<{
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    genre: string;
    year: number;
    trackNo: number;
    discNo: number;
  }>;
  mode: 'overwrite' | 'fillEmpty';
}

/** 批量标签更新结果 */
export interface BatchTagResult {
  updated: number;
  failed: number;
  errors: { trackId: number; error: string }[];
}

// ---------- API ----------

export const api = {
  /** 音乐库 */
  library: {
    /** 添加监控文件夹（后端弹出系统目录选择对话框），然后刷新库 */
    addFolder: () => invoke<void>('library_add_folder'),

    /** 扫描指定文件夹 */
    scan: (folderId: number) =>
      invoke<{ scanned: number }>('library_scan', { folderId }),

    /** 查询曲目列表 */
    query: (opts: QueryOpts) =>
      invoke<Track[]>('library_query', { opts }),

    /** 获取歌词 */
  getLyrics: (trackId: number) =>
    invoke<ParsedLyrics | null>('library_get_lyrics', { trackId }),

  /** 获取曲目文件路径（用于 convertFileSrc 播放） */
  getTrackPath: (trackId: number) =>
    invoke<string>('library_get_track_path', { trackId }),

  /** 从音乐库删除曲目（可选是否同时删除文件） */
  deleteTracks: (trackIds: number[], deleteFiles: boolean) =>
    invoke<void>('library_delete_tracks', { trackIds, deleteFiles }),

  /** 读取单个曲目的完整标签（含歌词、封面） */
  getTrackTags: (trackId: number) =>
    invoke<TrackTags>('library_get_track_tags', { trackId }),
  },

  /** 播放清单 */
  playlist: {
    create: (name: string) =>
      invoke<Playlist>('playlist_create', { name }),

    rename: (id: number, name: string) =>
      invoke<void>('playlist_rename', { id, name }),

    delete: (id: number) =>
      invoke<void>('playlist_delete', { id }),

    list: () =>
      invoke<Playlist[]>('playlist_list'),

    getTracks: (id: number) =>
      invoke<Track[]>('playlist_get_tracks', { id }),

    addTracks: (id: number, trackIds: number[]) =>
      invoke<void>('playlist_add_tracks', { id, trackIds }),

    removeTracks: (id: number, trackIds: number[]) =>
      invoke<void>('playlist_remove_tracks', { id, trackIds }),

    reorder: (id: number, fromPos: number, toPos: number) =>
      invoke<void>('playlist_reorder', { id, fromPos, toPos }),
  },

  /** 标签编辑 */
  tag: {
    batchUpdate: (req: BatchTagUpdate) =>
      invoke<BatchTagResult>('tag_batch_update', { req }),
  },

  /** 均衡器预设 */
  eq: {
    listPresets: () =>
      invoke<EqPreset[]>('eq_list_presets'),

    savePreset: (preset: EqPreset) =>
      invoke<void>('eq_save_preset', { preset }),
  },

  /** 本地听歌记忆 */
  playback: {
    record: (trackId: number, position: number, meaningfulPlay: boolean) =>
      invoke<void>('playback_record', { trackId, position, meaningfulPlay }),

    getResume: (trackId: number) =>
      invoke<number | null>('playback_get_resume', { trackId }),

    queryMemory: (mode: 'recent' | 'frequent') =>
      invoke<Track[]>('playback_query_memory', { mode }),
  },

  /** 构造可播放 URL（通过 Tauri convertFileSrc） */
  streamUrl: async (trackId: number): Promise<string> => {
    const path = await api.library.getTrackPath(trackId);
    return convertFileSrc(path);
  },
};
