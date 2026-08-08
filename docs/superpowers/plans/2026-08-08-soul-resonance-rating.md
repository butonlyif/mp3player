# Soul Resonance Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent four-level “私人共鸣” rating that is instantly visible, editable, and sortable in every Soul Play song list.

**Architecture:** Store `resonance` as a validated integer on each local track record and expose one Tauri update command. Keep display-name resolution, stable rating sorting, and rating labels in a small frontend domain module; let a reusable `ResonanceMark` own interaction and visuals while Zustand performs optimistic updates and rollback.

**Tech Stack:** Rust, rusqlite, Tauri 2, TypeScript, React 18, Zustand, Vitest, Testing Library, CSS.

## Global Constraints

- Levels are exactly `0 = 无感`, `1 = 有感觉`, `2 = 共鸣`, `3 = 灵魂曲`.
- Ratings stay local to Soul Play and are never written to audio tags.
- Existing ratings survive a normal library rescan.
- Unrated tracks render no persistent mark; hover/focus may reveal a ghost mark.
- A rating control must not select or play its row.
- Do not add automatic ratings, half-levels, cloud sync, rating history, bulk rating, or a smart playlist.
- Keep all unrelated user worktree changes untouched.

---

### Task 1: Persist and expose resonance

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces: Rust `Track.resonance: i64` and TypeScript `Track.resonance: ResonanceLevel`.
- Produces: `db::update_track_resonance(conn, track_id, resonance)`.
- Produces: Tauri command `library_update_resonance(track_id: i64, resonance: i64, state)`.
- Produces: `api.library.updateResonance(trackId: number, resonance: ResonanceLevel): Promise<void>`.

- [ ] **Step 1: Write failing Rust database tests**

Add tests beside the existing `db.rs` tests that initialize an in-memory database and assert:

```rust
assert_eq!(get_track_by_id(&conn, id)?.unwrap().resonance, 0);
update_track_resonance(&conn, id, 3)?;
assert_eq!(get_track_by_id(&conn, id)?.unwrap().resonance, 3);
assert!(update_track_resonance(&conn, id, 4).is_err());
insert_tracks(&conn, &[rescanned_track])?;
assert_eq!(get_track_by_id(&conn, id)?.unwrap().resonance, 3);
```

- [ ] **Step 2: Run the focused Rust test and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml resonance -- --nocapture`

Expected: failure because `Track.resonance` and `update_track_resonance` do not exist. If Cargo is unavailable, record that limitation and continue with TypeScript verification.

- [ ] **Step 3: Add schema migration and DAO support**

Add `resonance INTEGER NOT NULL DEFAULT 0 CHECK(resonance BETWEEN 0 AND 3)` to new schemas and an idempotent migration for existing databases. Extend `Track`, `TRACK_COLUMNS`, `row_to_track`, scanner-created track defaults, and insert bindings. Keep `resonance` out of the `ON CONFLICT(path) DO UPDATE SET` clause so rescans preserve it.

Implement validation and affected-row checking:

```rust
pub fn update_track_resonance(conn: &Connection, track_id: i64, resonance: i64) -> rusqlite::Result<()> {
    if !(0..=3).contains(&resonance) {
        return Err(rusqlite::Error::InvalidParameterName("resonance must be 0..=3".into()));
    }
    let changed = conn.execute(
        "UPDATE tracks SET resonance = ?1 WHERE id = ?2",
        params![resonance, track_id],
    )?;
    if changed == 0 { return Err(rusqlite::Error::QueryReturnedNoRows); }
    Ok(())
}
```

- [ ] **Step 4: Add the Tauri and TypeScript API boundary**

Define and export:

```ts
export type ResonanceLevel = 0 | 1 | 2 | 3;

updateResonance: (trackId: number, resonance: ResonanceLevel) =>
  invoke<void>('library_update_resonance', { trackId, resonance })
```

Register `library_update_resonance` in `tauri::generate_handler!` and map database errors to strings in the command.

- [ ] **Step 5: Run focused tests and commit**

Run `cargo test --manifest-path src-tauri/Cargo.toml resonance -- --nocapture` when Cargo exists, then `npm run build`.

Commit only Task 1 files with `git commit -m "feat: persist track resonance ratings"`.

---

### Task 2: Add the frontend resonance domain and optimistic state update

**Files:**
- Create: `src/library/resonance.ts`
- Create: `src/library/resonance.test.ts`
- Modify: `src/store/useStore.ts`
- Modify: `src/store/useStore.test.ts`

**Interfaces:**
- Consumes: `Track.resonance`, `ResonanceLevel`, and `api.library.updateResonance` from Task 1.
- Produces: `trackDisplayTitle(track): string`.
- Produces: `nextResonance(level): ResonanceLevel`.
- Produces: `sortByResonanceStable(tracks, direction): Track[]`.
- Produces: store action `setTrackResonance(trackId, level): Promise<void>` with optimistic update and rollback.

- [ ] **Step 1: Write failing pure-domain tests**

Cover exact behavior:

```ts
expect(trackDisplayTitle({ title: 'Song', file_name: 'file.mp3' } as Track)).toBe('Song');
expect(trackDisplayTitle({ title: null, file_name: 'Song.demo.mp3' } as Track)).toBe('Song.demo');
expect([0, 1, 2, 3].map(nextResonance)).toEqual([1, 2, 3, 0]);
expect(sortByResonanceStable([a1, b3, c1], 'desc').map(t => t.id)).toEqual([b3.id, a1.id, c1.id]);
```

Also assert ascending order and stable order among equal levels.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run src/library/resonance.test.ts`

Expected: failure because `src/library/resonance.ts` does not exist.

- [ ] **Step 3: Implement the pure domain functions**

Use immutable stable sorting with original indices as the final tie-breaker. Remove only the final filename extension with `/\.[^.]+$/` and fall back to the original filename if stripping would produce an empty string.

- [ ] **Step 4: Write failing optimistic-update store tests**

Mock `api.library.updateResonance`. Assert the target track updates immediately in `tracks`, `playlistTracks`, `currentTrack`, and `playbackQueue`; assert a rejected promise restores every prior value without affecting unrelated tracks.

- [ ] **Step 5: Implement optimistic update and rollback**

Capture the prior resonance for every store collection, apply the new level synchronously, await the API call, and restore only if the same update still owns the current value. Re-throw failure so the UI can show a lightweight message.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- --run src/library/resonance.test.ts src/store/useStore.test.ts`

Commit Task 2 files with `git commit -m "feat: add resonance rating state"`.

---

### Task 3: Build the Soul Mark control and simplify the main song table

**Files:**
- Create: `src/components/ResonanceMark.tsx`
- Create: `src/components/ResonanceMark.test.tsx`
- Modify: `src/components/LibraryView.tsx`
- Modify: `src/components/LibraryView.contextQueue.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `ResonanceLevel`, `nextResonance`, `trackDisplayTitle`, and store `setTrackResonance`.
- Produces: `<ResonanceMark level onChange />` that stops click, double-click, and pointer propagation.

- [ ] **Step 1: Write failing component tests**

Render all four levels and assert:

```tsx
expect(screen.queryByTestId('resonance-line-0')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: '共鸣 · 点击修改' })).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: '共鸣 · 点击修改' }));
expect(onChange).toHaveBeenCalledWith(3);
expect(rowPlay).not.toHaveBeenCalled();
```

Test direct choice of levels 0–3 from the hover/focus popover and keyboard activation with Enter/Space.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run src/components/ResonanceMark.test.tsx`

Expected: failure because the component does not exist.

- [ ] **Step 3: Implement `ResonanceMark` and its CSS**

Render a fixed-width button slot, one line with level classes, and a four-choice popover shown through `:hover` and `:focus-within`. Use CSS custom properties for the cyan, violet, and pink gradients; keep the zero-level line transparent until hover/focus. Add accessible labels for each choice.

- [ ] **Step 4: Write failing main-table integration tests**

Assert the main table has no “文件名” header, renders metadata title or stripped filename fallback, shows the resonance control, and clicking it does not call `playTrack` or row selection.

- [ ] **Step 5: Integrate the control and merged title column**

Remove the separate `file_name` column and expand `col-title`. Render `ResonanceMark` immediately before `trackDisplayTitle(track)`. On update failure, surface a compact alert or existing lightweight error mechanism while the store rolls back.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- --run src/components/ResonanceMark.test.tsx src/components/LibraryView.contextQueue.test.tsx`

Commit Task 3 files with `git commit -m "feat: add soul marks to track list"`.

---

### Task 4: Add three-state resonance sorting to every grouped view

**Files:**
- Modify: `src/store/useStore.ts`
- Modify: `src/components/LibraryView.tsx`
- Modify: `src/library/contextQueue.ts`
- Modify: `src/library/contextQueue.test.ts`
- Modify: `src/components/LibraryView.contextQueue.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `sortByResonanceStable` and `ResonanceMark`.
- Produces: sort field `resonance` with cycle `desc → asc → previous sort`.
- Produces: album-local and direct-folder-local sorted queues without crossing group boundaries.

- [ ] **Step 1: Write failing sort-cycle and queue tests**

Assert the first resonance-header click selects descending, the second ascending, and the third restores both the prior field and direction. For album/folder queues, assert only tracks inside the clicked group appear and their order matches the visible rating order.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run src/library/contextQueue.test.ts src/components/LibraryView.contextQueue.test.tsx src/store/useStore.test.ts`

Expected: failures for the missing resonance sort state and controls.

- [ ] **Step 3: Implement sort-state restoration**

Store the prior `{ sortBy, sortOrder }` when entering resonance sorting. Implement the exact three-state transition and keep existing two-state header behavior for other fields.

- [ ] **Step 4: Integrate album and folder marks and local sorting**

Add a compact “共鸣” control to grouped view headers. Sort each album’s tracks independently and each folder node’s direct tracks independently. Pass the exact rendered array to `playTrack(track, queue)` so next/previous follows the visible order.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- --run src/library/contextQueue.test.ts src/components/LibraryView.contextQueue.test.tsx src/store/useStore.test.ts`

Commit Task 4 files with `git commit -m "feat: sort library by resonance"`.

---

### Task 5: Verify the complete feature

**Files:**
- Modify only files required to fix failures discovered by verification.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a tested, buildable Soul Resonance feature.

- [ ] **Step 1: Run all frontend tests**

Run: `npm test`

Expected: every Vitest file and test passes with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 3: Run native tests when available**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: all Rust tests pass. If Cargo is unavailable in the environment, report this explicitly rather than claiming native verification.

- [ ] **Step 4: Inspect change boundaries**

Run: `git diff --check` and `git status --short`. Confirm only planned feature files are committed and pre-existing user changes such as `tsconfig.tsbuildinfo` remain untouched.

- [ ] **Step 5: Request final code review and address findings**

Review the full range from the plan commit to the implementation HEAD for data migration safety, optimistic-update races, click propagation, stable sorting, and grouped queue boundaries. Fix every Critical or Important finding and rerun Steps 1–4.
