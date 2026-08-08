# Soul Play Brand and Context Queues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the application to Soul Play, ship the approved “Soul Ripple” icon across Tauri targets, and make album/folder views create bounded contextual playback queues.

**Architecture:** Branding changes remain configuration and asset-only, preserving `com.lumen.player` and internal storage identifiers. Queue construction is extracted into pure helpers, while `LibraryView` continues to own the single `playTrack(track, queue)` Store call and child grouping components only report the selected track plus their local queue.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Tauri v2 icon tooling, built-in ImageGen.

## Global Constraints

- User-visible application name is exactly `Soul Play`.
- Preserve Tauri identifier `com.lumen.player` and internal database/protocol names.
- Final icon has no text, letters, or conventional play triangle.
- Album queues respect current search results and sort by disc number, track number, then filename.
- Folder queues contain only the selected track’s current folder level and never include child folders.
- Preserve unrelated user changes in Rust files and deleted MP3 files.

---

### Task 1: Pure contextual queue policy

**Files:**
- Create: `src/library/contextQueue.ts`
- Create: `src/library/contextQueue.test.ts`

**Interfaces:**
- Consumes: frontend `Track` objects from `src/lib/api.ts`.
- Produces: `sortAlbumQueue(tracks: Track[]): Track[]` and `folderQueue(tracks: Track[]): Track[]`.

- [ ] **Step 1: Write failing album and folder policy tests**

Test that album tracks order by `disc_no`, then `track_no`, then `file_name`; missing numbers sort after known numbers. Test that `folderQueue` returns a stable copy containing only the supplied current-level tracks.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `npm test -- src/library/contextQueue.test.ts`

Expected: FAIL because `contextQueue.ts` does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Use a numeric comparator that converts `null` to `Number.POSITIVE_INFINITY`, returns a copied array, and finishes with `file_name.localeCompare(..., 'zh-CN')` for stable ordering.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run: `npm test -- src/library/contextQueue.test.ts`

Expected: all contextual queue policy tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/library/contextQueue.ts src/library/contextQueue.test.ts
git commit -m "test: define contextual playback queues"
```

### Task 2: Connect album and folder playback contexts

**Files:**
- Modify: `src/components/LibraryView.tsx`
- Create: `src/components/LibraryView.contextQueue.test.tsx`

**Interfaces:**
- Consumes: `sortAlbumQueue`, `folderQueue`, and Zustand `playTrack(track, queue)`.
- Produces: `AlbumMode.onPlay(track, albumQueue)` and `FolderNode.onPlay(track, folderQueue)` callbacks.

- [ ] **Step 1: Write failing component tests**

Render album and folder modes through `LibraryView`, expand a group, double-click its second song, and assert the mocked Store receives exactly the local group queue. Include another album and a child folder track to prove neither leaks into the queue.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `npm test -- src/components/LibraryView.contextQueue.test.tsx`

Expected: FAIL because grouped views still call the library-wide queue callback.

- [ ] **Step 3: Update callbacks without adding Store dependencies to child components**

Change the local callback contract to `(track: Track, queue: Track[]) => void`. `AlbumMode` supplies `sortAlbumQueue(album.tracks)`; each `FolderNode` supplies `folderQueue(node.tracks)`. The filename table supplies its existing `visibleTracks` queue.

- [ ] **Step 4: Run focused and existing LibraryView tests**

Run: `npm test -- src/components/LibraryView.contextQueue.test.tsx`

Expected: album and folder queues are bounded and ordered.

- [ ] **Step 5: Commit**

```bash
git add src/components/LibraryView.tsx src/components/LibraryView.contextQueue.test.tsx
git commit -m "fix: keep grouped playback in context"
```

### Task 3: Rename all user-visible application surfaces

**Files:**
- Modify: `index.html`
- Modify: `src/components/TitleBar.tsx`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the exact brand string `Soul Play`.
- Produces: matching web title, custom titlebar label, Tauri product/window titles, and npm package metadata.

- [ ] **Step 1: Add a static branding verification test**

Create `src/branding.test.ts` that reads no filesystem at runtime; instead export `APP_NAME = 'Soul Play'` from `src/branding.ts`, render `TitleBar`, and assert its accessible text. Keep Tauri JSON verification as a build-time command.

- [ ] **Step 2: Replace user-visible and package metadata names**

Use `Soul Play` for UI/Tauri titles and `soul-play` for npm package names. Do not change `com.lumen.player`, `lumen.db`, or `lumen-audio`.

- [ ] **Step 3: Verify exact configuration values**

Run: `rg -n "Peter Player|lumen-player" index.html src package.json package-lock.json src-tauri/tauri.conf.json`

Expected: no matches. Then run: `rg -n '"identifier": "com.lumen.player"' src-tauri/tauri.conf.json`

Expected: exactly one match.

- [ ] **Step 4: Commit**

```bash
git add index.html src/branding.ts src/branding.test.ts src/components/TitleBar.tsx src-tauri/tauri.conf.json package.json package-lock.json
git commit -m "feat: rename app to Soul Play"
```

### Task 4: Generate and install the Soul Ripple icon

**Files:**
- Create: `src-tauri/icons/soul-play-master.png`
- Replace generated platform icon files under: `src-tauri/icons/`

**Interfaces:**
- Consumes: approved A direction: dark navy rounded square, three organic cyan-purple-magenta elliptical ripples, bright central soul core, no text or play triangle.
- Produces: 1024×1024 master plus Tauri PNG/ICO/ICNS/platform icon family.

- [ ] **Step 1: Generate the 1024×1024 project-bound master with built-in ImageGen**

Prompt for a polished raster app icon with strong small-size silhouette, centered composition, clean edges, no text, no letters, no watermark, and no play symbol. Copy the selected result into `src-tauri/icons/soul-play-master.png`.

- [ ] **Step 2: Inspect the generated master**

Verify the subject, palette, square composition, lack of text, and legibility at icon size. If necessary, make one targeted ImageGen iteration.

- [ ] **Step 3: Generate platform assets**

Run: `npm run tauri icon src-tauri/icons/soul-play-master.png`

Expected: Tauri regenerates PNG, ICO, ICNS, Windows, iOS, and Android icon assets beneath `src-tauri/icons`.

- [ ] **Step 4: Verify expected icon files**

Check that `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`, and `icon.icns` exist and are non-empty.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/icons
git commit -m "feat: add Soul Play application icon"
```

### Task 5: Full verification and review

**Files:**
- Review all files changed by Tasks 1–4.

**Interfaces:**
- Consumes: completed brand, icon, and contextual queue slices.
- Produces: verified release-ready source changes without touching unrelated user files.

- [ ] **Step 1: Run full frontend verification**

Run: `npm test && npm run build && git diff --check`

Expected: all tests pass, production build succeeds, and no whitespace errors are reported.

- [ ] **Step 2: Request independent code review**

Review queue boundaries, album ordering, rename completeness, icon references, generated asset integrity, and unrelated-change isolation. Fix all concrete findings.

- [ ] **Step 3: Inspect worktree isolation**

Run: `git status --short`

Expected: pre-existing Rust edits, MP3 deletions, and generated `tsconfig.tsbuildinfo` may remain unstaged; no implementation file from this plan remains uncommitted.
