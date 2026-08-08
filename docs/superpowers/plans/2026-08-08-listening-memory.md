# Listening Memory Implementation Plan

**Goal:** Add local recent/frequent listening views and safe resume for audio longer than ten minutes.

**Architecture:** SQLite remains the source of truth. A small playback-memory table records meaningful plays and resume positions through Tauri commands. The React layer batches progress writes and exposes memory as two lightweight library filters, reusing the existing track list.

**Tech Stack:** Rust, rusqlite, Tauri IPC, React, Zustand, Vitest.

---

### Task 1: Define and test playback-memory policy

**Files:**
- Create: `src/listening/playbackMemory.ts`
- Create: `src/listening/playbackMemory.test.ts`

Implement pure rules for the 30-second meaningful-play threshold, ten-minute resume eligibility, progress-write throttling, and near-end resume clearing.

### Task 2: Persist memory in SQLite

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

Add an idempotent `playback_memory` table keyed by track id. Add commands to record progress/meaningful plays, fetch resume position, and query recent/frequent tracks. Keep the existing user edits in Rust files intact.

### Task 3: Add typed frontend API and memory controller

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/listening/usePlaybackMemory.ts`
- Create: `src/listening/usePlaybackMemory.test.tsx`

Batch progress writes, record a play only once per playback session, restore eligible positions after metadata loads, and clear resume near completion.

### Task 4: Expose recent and frequent views

**Files:**
- Modify: `src/store/useStore.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/LibraryView.tsx`
- Modify: `src/styles.css`

Add “最近播放” and “常听” navigation entries. Reuse the library view and existing row interactions rather than adding a new screen.

### Task 5: Verify and commit

Run focused tests, full `npm test`, `npm run build`, Rust tests when Cargo is available, and `git diff --check`. Request independent review, fix findings, then commit only listening-memory files.
