# MP3 播放器设计说明书

> 项目代号：**Lumen Player**
> 版本：v0.2（Tauri 2 架构稿）
> 日期：2026-08-08
> 角色：Architect

---

## 1. 项目概述

### 1.1 目标
构建一款跨平台（macOS + Windows）的桌面 MP3 播放器，对标 **Swinsian** 的本地音乐库管理体验，核心特性：

1. **原地引用导入**——导入音乐时不复制文件，仅记录绝对路径，保持用户既有目录结构不被破坏。
2. **音乐库 + 播放清单双轨制**——音乐库管理全部导入曲目（按文件名/专辑/文件夹浏览）；用户可创建多个播放清单，从库中添加曲目；**播放始终基于播放清单**，支持顺序/随机/单曲循环。
3. **均衡器（EQ）**——10 段参数均衡器，内置预设并可自定义保存。
4. **歌词滚动播放**——解析嵌入在文件中的歌词（ID3 `USLT` / `SYLT`、Vorbis `LYRICS`/`UNSYNCEDLYRICS`），按时间戳逐行高亮滚动。
5. **批量标签编辑**——选中多首曲目后可批量修改 artist / album / year / genre 等字段并写回文件（lofty），支持"仅填充空字段"和"覆盖"两种模式。
6. **半透明玻璃质感 UI**——macOS 原生 vibrancy + Windows 原生 acrylic/mica，CSS 半透明层叠。
7. **舒适耐看的配色**——低饱和暖中性色系（见 §5.6）。

### 1.2 非目标（v0.1）
- 在线流媒体、账号体系、云同步。
- 自动歌词下载（仅读取本地已嵌入歌词）。
- 移动端（Tauri 2 架构上预留，后续可迭代）。

### 1.3 迭代预留
当前浏览维度精简为文件名/专辑/文件夹；数据库 schema 与模块边界为后续扩展艺术家、流派、智能歌单、播放列表、在线歌词等留好接口，无需重构。

---

## 2. 技术栈选型（含证据）

| 领域 | 选型 | 版本 | 依据 |
|---|---|---|---|
| 桌面框架 | **Tauri 2** | 2.x | 包体积 3–10MB（Electron 80–150MB）、空闲内存 30–40MB（Electron 150–300MB）、启动 <1s；用系统 WebView，不打包 Chromium |
| 前端 UI | **React 18 + TypeScript** | 18 / 5.x | 生态成熟，类型安全；WebView 内运行 |
| 构建 | **Vite** | 6.x | 极速 HMR，配合 Tauri CLI |
| 状态管理 | **Zustand** | 5.x | 轻量，避免 Redux 样板 |
| 后端语言 | **Rust** | stable | 编译为原生二进制，高性能、内存安全；无运行时依赖 |
| 元数据/歌词解析 | **lofty** (Rust crate) | 0.24+ | 支持 ID3v1/v2.2/2.3/2.4、APE、Vorbis、MP4；支持 `SYLT`/`USLT`、`LYRICS`/`UNSYNCEDLYRICS`（见 [lofty #561](https://github.com/Serial-ATA/lofty-rs/issues/561)） |
| 音频引擎 | **Web Audio API** | WebView 内置 | `BiquadFilterNode`（peaking/lowshelf/highshelf）实现参数 EQ；HTML5 Audio 负责解码播放 |
| 持久化 | **rusqlite**（bundled SQLite） | 0.32+ | 纯 Rust 绑定，bundled 编译无需系统 SQLite；WAL 模式 |
| 窗口玻璃 | **window-vibrancy** (Tauri 官方 crate) | 0.5+ | macOS `apply_vibrancy`（NSVisualEffectView）；Windows `apply_acrylic`/`apply_mica`（DWM 原生） |
| 打包 | **Tauri CLI**（内置） | — | macOS dmg；Windows nsis/msi（WebView2 在 Win10 1803+/Win11 预装） |

**为什么 Tauri 2 而非 Electron**：
- 体积小约 10 倍（~8MB vs ~130MB），内存低约 5 倍（~40MB vs ~250MB），直接解决"重、不流畅"痛点。
- 用系统 WebView（Windows=WebView2/Edge，macOS=WKWebView），不打包整个 Chromium。
- Rust 后端处理文件 I/O、元数据解析、数据库，性能远优于 Node.js。
- 前端仍是 React + TypeScript，UI 开发体验不变。
- 已有成熟音乐播放器先例验证可行性：[Musicsloth](https://github.com/Jiangye-Song/Musicsloth)（Tauri2+React+Symphonia）、[Lyra Music](https://github.com/twtrubiks/lyra-music)（Tauri2+Svelte+Rust+lofty+歌词滚动）。

**关键证据**：
- Web Audio `BiquadFilterNode` 的 `peaking` 类型配合 Audio EQ Cookbook 系数可实现标准参数 EQ（见 [MDN](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode/BiquadFilterNode)、[Audio-EQ-Cookbook](https://github.com/WebAudio/Audio-EQ-Cookbook)）。
- `window-vibrancy` 跨平台玻璃：macOS `apply_vibrancy`、Windows `apply_acrylic`（见 [tauri-apps/window-vibrancy](https://github.com/tauri-apps/window-vibrancy)）。
- WebView2 在 Windows 10 1803+/Windows 11 预装，覆盖率高（见 Tauri 文档）。

---

## 3. 进程模型与模块边界

采用 Tauri 2 的 **Rust 后端 + WebView 前端** 架构，通过 `#[tauri::command]` + `invoke()` 通信。

```
┌──────────────── Rust Backend (src-tauri/) ──────────────────┐
│  main.rs            应用入口、窗口创建、玻璃效果 setup         │
│  commands/          #[tauri::command] IPC 命令层              │
│    ├── library      add_folder / scan / query / get_lyrics   │
│    ├── playlist     create / rename / delete / list / tracks │
│    ├── tag          batch_update（批量写回 lofty + SQLite）    │
│    └── eq           list_presets / save_preset               │
│  library/           原地引用库：扫描、索引、SQLite 读写        │
│  scanner/           递归目录扫描（walkdir + 扩展名过滤）       │
│  metadata/          lofty 解析：标签 + 歌词提取（USLT/SYLT）  │
│  db/                rusqlite 封装、schema、迁移               │
│  audio_stream/      自定义 URI scheme → 安全流式读取文件      │
│  config/            用户配置、EQ 预设持久化                    │
└──────────────────────────┬───────────────────────────────────┘
                           │ tauri::command / invoke / events
┌──────────────────────────┴───────────────────────────────────┐
│  WebView Frontend (src/ · React + Web Audio)                  │
│  audio/             AudioEngine：MediaSource→EQ链→destination │
│  lyrics/            歌词滚动渲染（rAF + 二分查找）             │
│  store/             Zustand：播放状态、队列、库、UI 状态       │
│  components/        UI 组件（库表、播放栏、EQ面板、歌词面板）  │
│    ├── views        BrowseByAlbum / BrowseByFolder / TrackList│
│  theme/             配色 token、玻璃材质样式                   │
│  lib/api.ts         Tauri invoke 封装（类型安全的 IPC 客户端） │
└──────────────────────────────────────────────────────────────┘
```

**跨进程契约**：前端通过 `@tauri-apps/api` 的 `invoke()` 调用 Rust 命令；Rust 通过 `emit()` 向前端推送事件（如扫描进度）。前端 **不直接** 访问文件系统，所有 fs 操作经 Rust 命令。

---

## 4. 数据模型

### 4.1 数据库表（SQLite，rusqlite）

```sql
-- 曲目（原地引用：只存 path，不存文件内容）
CREATE TABLE tracks (
  id            INTEGER PRIMARY KEY,
  path          TEXT UNIQUE NOT NULL,      -- 绝对路径，不复制
  file_name     TEXT,                      -- 浏览维度1：文件名
  title         TEXT,
  artist        TEXT,
  album         TEXT,                      -- 浏览维度2：专辑
  album_artist  TEXT,
  folder_path   TEXT,                      -- 浏览维度3：文件夹
  genre         TEXT,                      -- 预留：后续流派视图
  year          INTEGER,
  track_no      INTEGER,
  disc_no       INTEGER,
  duration      REAL,                       -- 秒
  bitrate       INTEGER,
  sample_rate   INTEGER,
  has_lyrics    INTEGER DEFAULT 0,
  lyrics_type   TEXT,                       -- 'synced' | 'plain' | NULL
  file_mtime    INTEGER,                    -- 增量扫描用
  added_at      INTEGER,
  play_count    INTEGER DEFAULT 0
);
CREATE INDEX idx_album       ON tracks(album);
CREATE INDEX idx_folder_path ON tracks(folder_path);
CREATE INDEX idx_file_name   ON tracks(file_name);
CREATE INDEX idx_title       ON tracks(title);
CREATE INDEX idx_artist      ON tracks(artist);   -- 预留

-- 扫描根目录（可多个）
CREATE TABLE watch_folders (
  id    INTEGER PRIMARY KEY,
  path  TEXT UNIQUE NOT NULL
);

-- EQ 预设
CREATE TABLE eq_presets (
  id    INTEGER PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  gains TEXT NOT NULL,                      -- JSON: [g0..g9] dB
  builtin INTEGER DEFAULT 0
);

-- 播放清单
CREATE TABLE playlists (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

-- 播放清单曲目（多对多，有序）
CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL,
  track_id    INTEGER NOT NULL,
  position    INTEGER NOT NULL,             -- 播放顺序
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);
CREATE INDEX idx_pl_position ON playlist_tracks(playlist_id, position);
```

### 4.2 歌词数据结构（前端）

```ts
interface LyricLine {
  time: number | null;  // 秒（同步歌词）；纯文本为 null
  text: string;
}
interface ParsedLyrics {
  type: 'synced' | 'plain';
  lines: LyricLine[];
  offset?: number;       // LRC [offset:] 毫秒
}
```

### 4.3 IPC 命令契约

```ts
// 前端 lib/api.ts —— 对 Tauri invoke 的类型安全封装
interface Commands {
  // 库管理
  library_add_folder: () => Promise<WatchFolder>;
  library_scan: (folderId: number) => Promise<ScanResult>;
  library_query: (opts: QueryOpts) => Promise<Track[]>;
  library_get_lyrics: (trackId: number) => Promise<ParsedLyrics | null>;
  // 批量标签编辑
  tag_batch_update: (req: BatchTagUpdate) => Promise<BatchTagResult>;
  // 播放清单
  playlist_create: (name: string) => Promise<Playlist>;
  playlist_rename: (id: number, name: string) => Promise<void>;
  playlist_delete: (id: number) => Promise<void>;
  playlist_list: () => Promise<Playlist[]>;
  playlist_get_tracks: (id: number) => Promise<Track[]>;
  playlist_add_tracks: (id: number, trackIds: number[]) => Promise<void>;
  playlist_remove_tracks: (id: number, trackIds: number[]) => Promise<void>;
  playlist_reorder: (id: number, fromPos: number, toPos: number) => Promise<void>;
  // EQ
  eq_list_presets: () => Promise<EqPreset[]>;
  eq_save_preset: (preset: EqPreset) => Promise<void>;
  // 音频流（自定义 scheme: lumen://stream/<id>）
  stream_url: (trackId: number) => Promise<string>;
}

// 批量标签编辑请求
interface BatchTagUpdate {
  trackIds: number[];              // 要修改的曲目
  fields: Partial<{                // 仅提供需要修改的字段
    title: string; artist: string; album: string;
    albumArtist: string; genre: string; year: number;
    trackNo: number; discNo: number;
  }>;
  mode: 'overwrite' | 'fillEmpty'; // overwrite=全覆盖; fillEmpty=仅填空
}
interface BatchTagResult {
  updated: number; failed: number;
  errors: { trackId: number; error: string }[];
}
// 事件（Rust → 前端）
type Events = {
  'scan:progress': { folderId: number; done: number; total: number };
};
```

---

## 5. 核心功能设计

### 5.1 原地引用导入

- **不复制文件**：`watch_folders` 记录用户选择的目录；`tracks.path` 仅存绝对路径。
- **增量扫描**：首次扫描用 `walkdir` 递归遍历音频扩展名，`lofty` 读取元数据入库；后续扫描比对 `file_mtime`，仅更新变化的文件，删除已不存在的文件。
- 扩展名白名单：`.mp3 .m4a .flac .ogg .opus .wav .aiff .wma`。
- 大库性能：Rust 端分批提交（每 500 条一次事务），通过 `emit('scan:progress')` 推送进度到前端。

### 5.2 音乐库浏览 + 播放清单

**侧栏分区**：
- **音乐库**（Library）——展示全部导入曲目，按三种维度浏览：
  1. **文件名**——曲目列表按文件名展示，可排序。
  2. **专辑**——专辑分组视图。
  3. **文件夹**——按 `folder_path` 的目录树浏览。
  - 排序：点击列头切换 asc/desc；搜索：前端即时过滤（防抖 200ms）。
  - 从库中选中曲目 → 右键/拖拽 → 添加到指定播放清单。

- **播放清单**（Playlists）——用户自建列表：
  - 创建/重命名/删除播放清单。
  - 管理清单内曲目（添加/移除/拖拽排序）。
  - **播放始终基于播放清单**：双击播放清单中的曲目，从该曲目开始按清单顺序播放。
  - 播放模式：顺序播放 / 随机 / 单曲循环（前端 store 管理）。

### 5.3 音频引擎与均衡器

**音频图**（前端 Web Audio，WebView 内运行）：
```
HTMLAudioElement → MediaElementAudioSourceNode
  → lowshelf (60Hz)        band 1
  → peaking  (170Hz)       band 2
  → peaking  (310Hz)       band 3
  → peaking  (600Hz)       band 4
  → peaking  (1kHz)        band 5
  → peaking  (3kHz)        band 6
  → peaking  (6kHz)        band 7
  → peaking  (12kHz)       band 8
  → peaking  (14kHz)       band 9
  → highshelf (16kHz)      band 10
  → GainNode (主音量)
  → destination
```

- 10 段：首段 lowshelf、末段 highshelf、中间 8 段 peaking，Q ≈ 1.4（参考 Audio EQ Cookbook）。
- 增益范围 ±12 dB。
- **预设**：内置 Flat / Bass Boost / Treble Boost / Vocal / Rock / Pop / Classical / Acoustic；用户可另存。预设存 SQLite `eq_presets`（Rust 端读写）。
- 切换音轨时复用同一音频图，仅替换 `src`（经自定义 `lumen://` scheme 由 Rust 安全流式返回文件字节），避免 EQ 重连闪烁。

### 5.4 歌词解析与滚动

**解析优先级**（Rust 后端，`lofty` 读取时即解析并缓存）：
1. ID3 `SYLT`（同步，二进制帧）→ lofty 提取，按 ID3v2 §4.10 格式得到 `{timestamp, text}`。
2. ID3 `USLT`（非同步纯文本）→ 检测是否含 `[mm:ss.xx]` LRC 行；是则按 LRC 解析为同步歌词，否则为纯文本。
3. Vorbis `LYRICS` / `UNSYNCEDLYRICS`（FLAC/OGG）→ 同 USLT 处理逻辑。
4. 外部 `.lrc`（同名同目录）作为补充来源。

**滚动渲染**（前端）：
- 维护当前播放时间（`requestAnimationFrame` 比对 `audio.currentTime`）。
- 二分查找当前行，高亮并平滑滚动居中（CSS transform，未播放行降低不透明度）。
- 同步歌词缺失时降级为纯文本静态展示。

### 5.5 半透明玻璃质感

- macOS：`window-vibrancy` 的 `apply_vibrancy(window, NSVisualEffectView::under-window)`。
- Windows：`window-vibrancy` 的 `apply_acrylic` 或 `apply_mica`（Win11）。
- 窗口配置：`transparent: true`，`decorations: false`（自定义标题栏 + `data-tauri-drag-region`）。
- CSS：根容器 `background: transparent`，面板用 `rgba(...)` + `backdrop-filter: blur(20px) saturate(180%)`；文字/图标保持不透明以保证对比度。

### 5.6 批量标签编辑

**后端**（Rust，`lofty` 写回文件）：
- 接收 `{trackIds, fields, mode}` 请求。
- 逐曲目：用 `lofty` 打开文件 → 按字段写入 Tag（Artist/Album/Title/Genre/Year/TrackNo/DiscNo）→ `save_to_file()`。
- `mode = overwrite`：所有指定字段全覆盖。
- `mode = fillEmpty`：仅当原字段为空时写入，已有值不覆盖。
- 写回成功后同步更新 SQLite `tracks` 表对应行。
- 逐条处理，收集成功/失败结果，全部完成后返回 `BatchTagResult`。

**前端**：
- 曲目列表支持多选（Ctrl/Cmd+点击多选，Shift+范围选）。
- 选中 ≥1 首时，工具栏出现「编辑标签」按钮，打开批编辑面板。
- 面板中每个字段可输入新值；留空的字段不修改（除非选择"清空"）。
- 模式切换：覆盖模式 / 仅填充空字段。
- 提交后显示进度和结果（成功 N 首，失败 N 首及原因）。

**安全策略**：
- 写入前自动备份元数据到内存（非文件副本），失败时回滚。
- 不可逆操作弹出确认对话框。
- Windows 上文件可能被占用（正在播放），返回明确错误而非崩溃。

### 5.7 配色方案（舒适耐看）

采用 **低饱和暖中性色系**（Warm Graphite），避免高饱和蓝紫。文字与交互元素保持高对比，背景层用半透明叠在玻璃上。

| Token | 浅色 | 深色（默认） |
|---|---|---|
| `--bg` | `rgba(245,242,237,0.72)` | `rgba(28,26,24,0.72)` |
| `--bg-elevated` | `rgba(255,253,248,0.60)` | `rgba(40,37,34,0.60)` |
| `--text` | `#2b2926` | `#e8e4dd` |
| `--text-muted` | `#6b6660` | `#9a938a` |
| `--accent` | `#c47b4a`（暖陶土橙） | `#d99a6c` |
| `--accent-soft` | `rgba(196,123,74,0.18)` | `rgba(217,154,108,0.20)` |
| `--border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` |
| `--lyric-active` | `--accent` | `--accent` |
| `--lyric-idle` | `--text-muted` | `rgba(154,147,138,0.5)` |

> 选色理由：暖陶土橙作强调色低饱和、不刺眼，与石墨灰背景形成沉稳的"老物件"质感，长时间使用不易疲劳；中性背景使专辑封面成为视觉焦点。

---

## 6. 目录结构

```
mp3player/
├── package.json              # 前端依赖 + scripts（dev/build 用 tauri CLI）
├── vite.config.ts
├── tsconfig*.json
├── index.html
├── src/                      # 前端（React，WebView 内运行）
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   └── api.ts            # Tauri invoke 类型安全封装
│   ├── audio/                # AudioEngine、EQ 链（Web Audio）
│   ├── lyrics/               # 歌词滚动渲染
│   ├── store/                # Zustand stores
│   ├── components/
│   │   ├── views/            # BrowseByAlbum / BrowseByFolder / TrackList
│   │   ├── PlayerBar.tsx
│   │   ├── EqPanel.tsx
│   │   ├── LyricsPanel.tsx
│   │   └── BatchTagEditor.tsx # 批量标签编辑面板
│   ├── theme/                # tokens、玻璃材质样式
│   └── styles/
├── src-tauri/                # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json       # 窗口、权限、bundle 配置
│   ├── capabilities/         # Tauri 权限声明
│   └── src/
│       ├── main.rs           # 入口：app、窗口、vibrancy setup
│       ├── commands/         # #[tauri::command] IPC 层
│       │   ├── library.rs
│       │   ├── playlist.rs   # 播放清单 CRUD
│       │   ├── tag.rs        # 批量标签编辑
│       │   └── eq.rs
│       ├── library/          # 扫描、查询逻辑
│       ├── scanner/          # walkdir 递归扫描
│       ├── metadata/         # lofty 解析 + 歌词提取
│       ├── db/               # rusqlite schema/dao
│       └── stream/           # 自定义 scheme 音频流
└── docs/DESIGN.md            # 本文档
```

---

## 7. 关键数据流 / 时序

### 7.1 导入与扫描
```
用户「添加文件夹」 → invoke('library_add_folder')
  → Rust: dialog 选目录 → 写 watch_folders → walkdir 递归扫描
  → 逐文件 lofty 读取元数据 → rusqlite 批量事务写 tracks
  → emit('scan:progress', {done,total}) → 前端进度条
  → 完成 → 前端刷新列表
```

### 7.2 播放
```
双击曲目 → audio.src = lumen://stream/<id>
  → Rust stream 命令安全读取文件字节流返回
  → 前端 Web Audio 图：source → EQ链(10) → gain → destination
  → audio.play() → store 更新 nowPlaying
  → 若有歌词：invoke('library_get_lyrics') → rAF 滚动
```

---

## 8. 风险与待决事项

| # | 风险/待决 | 状态 | 应对 |
|---|---|---|---|
| 1 | `SYLT` 帧格式（Content type / 时间戳格式 1/2）解析复杂 | 待验证 | lofty 支持 SYLT 提取；先支持文本格式 LRC，SYLT 用真实样本单测 |
| 2 | 大库（>5万曲）扫描与查询性能 | 待验证 | SQLite 索引 + 分页 + 虚拟列表；Rust 端扫描分批事务 |
| 3 | `MediaElementAudioSourceNode` 一旦创建无法回退到普通 audio | 已知 | 启动即建图，所有播放走 Web Audio 图 |
| 4 | 自定义 scheme 流式读取需在 Rust 注册 URI scheme handler | 待验证 | Tauri 2 支持 `register_uri_scheme_protocol`；参考 Lyra Music |
| 5 | Windows 玻璃：WebView2 与 acrylic/mica 合成兼容性 | 已知 | `window-vibrancy` 已处理；Linux 降级 backdrop-filter |
| 6 | Rust 编译环境首次配置（macOS 需 Xcode CLT，Windows 需 MSVC） | 已知 | Tauri 官方 installer 自动检测引导 |

---

## 9. 验收标准（v0.1）

1. 可添加文件夹，导入不复制文件，重启后库持久化。
2. 按文件名 / 专辑 / 文件夹三维度浏览音乐库，可列排序、实时搜索。
3. 可创建/删除/重命名播放清单，从音乐库添加曲目到播放清单，可拖拽排序。
4. 播放基于播放清单，支持顺序/随机/单曲循环模式。
5. 播放/暂停/上一首/下一首/进度拖动/音量正常。
6. 10 段 EQ 可调节、预设可切换与保存，效果可闻。
7. 含同步歌词的文件：歌词按时间逐行高亮滚动。
8. 选中多首曲目可批量编辑标签，写回文件，支持覆盖/仅填充空字段两种模式。
9. 界面呈现半透明玻璃质感（macOS vibrancy / Windows acrylic），深色暖中性配色。
10. macOS 与 Windows 均可正常构建运行。

---

*下一步：经用户确认后进入 Builder 实现阶段，用 Tauri CLI 脚手架搭建工程并逐模块实现。*
