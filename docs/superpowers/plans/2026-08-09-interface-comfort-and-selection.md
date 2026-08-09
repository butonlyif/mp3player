# Interface Comfort and Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved compact daily interface, fully isolated immersive mode, and consistent desktop-style multi-selection across library and playlist views.

**Architecture:** Keep Zustand as the single selection state owner, extract geometry and modifier-key rules into focused selection modules, and reuse a hook for marquee interaction in both table views. Keep immersive rendering at the `App` shell boundary so daily navigation and drawers are not rendered while immersive mode is active.

**Tech Stack:** React 18, TypeScript 5.6, Zustand 4.5, Vitest 4, Testing Library, CSS, inline SVG.

## Global Constraints

- Work directly on `main` as explicitly authorized by the user.
- Preserve the existing uncommitted `tsconfig.tsbuildinfo` change and never stage it.
- Do not add a third-party icon library or network font.
- Keep the warm color theme and existing audio, lyrics parsing, database, and queue behavior.
- “Remove from playlist”, “remove from library”, and “delete local files” remain distinct operations.
- First-version marquee selection does not auto-scroll at viewport edges.

---

### Task 1: Shared selection state and geometry

**Files:**
- Create: `src/selection/selectionModel.ts`
- Create: `src/selection/selectionModel.test.ts`
- Modify: `src/store/useStore.ts`
- Modify: `src/store/useStore.test.ts`

**Interfaces:**
- Produces: `Rect`, `intersectsRect(a, b): boolean`, `idsIntersectingRect(selection, rows): number[]`.
- Produces: store action `setSelection(ids: Iterable<number>, anchorId?: number | null): void`.
- Produces: store action `retainSelection(ids: Iterable<number>): void`.

- [ ] **Step 1: Write failing geometry and store tests**

```ts
expect(idsIntersectingRect({ left: 0, top: 25, right: 100, bottom: 75 }, rows)).toEqual([2, 3]);
useStore.getState().setSelection([2, 3], 2);
expect([...useStore.getState().selectedTrackIds]).toEqual([2, 3]);
useStore.getState().retainSelection([3, 4]);
expect([...useStore.getState().selectedTrackIds]).toEqual([3]);
```

- [ ] **Step 2: Run focused tests and confirm failures are caused by missing APIs**

Run: `npm test -- src/selection/selectionModel.test.ts src/store/useStore.test.ts`

- [ ] **Step 3: Implement pure rectangle intersection and atomic selection actions**

Use inclusive rectangle intersection and one Zustand update per marquee movement. When retention removes the anchor, set `_lastSelectedId` to `null`.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `npm test -- src/selection/selectionModel.test.ts src/store/useStore.test.ts`

### Task 2: Reusable desktop selection interaction

**Files:**
- Create: `src/selection/useMarqueeSelection.ts`
- Create: `src/selection/useMarqueeSelection.test.tsx`
- Modify: `src/components/LibraryView.tsx`
- Modify: `src/components/PlaylistView.tsx`
- Create: `src/components/PlaylistView.selection.test.tsx`

**Interfaces:**
- Consumes: `setSelection`, `retainSelection`, `idsIntersectingRect`.
- Produces: `useMarqueeSelection({ containerRef, rowSelector, selectedIds, setSelection })` returning pointer handlers and marquee rectangle.
- Produces: consistent single-click, Shift-range, Command/Ctrl-toggle, Escape-clear behavior in both views.

- [ ] **Step 1: Write failing interaction tests**

Test that playlist Shift-click selects a visible range, Command/Ctrl-click toggles one row, Escape clears, and a background pointer drag updates selection. Test that pointer-down on `[data-selection-ignore]` does not start marquee selection.

- [ ] **Step 2: Run focused tests and confirm the missing behavior fails**

Run: `npm test -- src/selection/useMarqueeSelection.test.tsx src/components/PlaylistView.selection.test.tsx`

- [ ] **Step 3: Implement the hook and integrate both views**

Rows expose `data-track-id`. Interactive controls expose `data-selection-ignore`. Render one absolutely positioned `.selection-marquee` inside the scroll body. Retain only visible selections when the visible ID list changes.

- [ ] **Step 4: Separate playlist reordering from selection**

Remove whole-row draggable behavior and add a dedicated button with `aria-label="拖动排序"`, `draggable`, and existing drag handlers. Mark it `data-selection-ignore`.

- [ ] **Step 5: Run focused tests and confirm green**

Run: `npm test -- src/selection/useMarqueeSelection.test.tsx src/components/PlaylistView.selection.test.tsx src/components/PlaylistView.resonance.test.tsx`

### Task 3: Compact icon actions and safe destructive operations

**Files:**
- Create: `src/components/Icon.tsx`
- Create: `src/components/Icon.test.tsx`
- Modify: `src/components/PlayerBar.tsx`
- Modify: `src/components/LibraryView.tsx`
- Modify: `src/components/PlaylistView.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `<Icon name="edit|equalizer|lyrics|immersive|remove|trash|grip|close|more" />` with decorative SVG hidden from accessibility.
- Consumes existing callbacks and API methods; labels remain on buttons through `aria-label` and `title`.

- [ ] **Step 1: Write failing accessible-icon and action tests**

Test that icon buttons retain accessible names, four persistent player actions do not rely on visible long text, playlist removal remains available for selected tracks, and library file deletion still passes `deleteFiles=true` after confirmation.

- [ ] **Step 2: Run tests and confirm expected failures**

Run: `npm test -- src/components/Icon.test.tsx src/components/PlayerBar.test.tsx src/components/PlaylistView.selection.test.tsx`

- [ ] **Step 3: Implement inline SVG icons and compact actions**

Use a shared `Icon` component, 32px fixed-size action buttons, tooltips, active styling, and a compact selected-count action bar. Keep both top actions and context-menu actions.

- [ ] **Step 4: Clarify destructive copy and responsive overflow**

Use distinct labels: `从播放列表移除`, `从音乐库移除`, `删除本地文件`. Keep the latter red and confirmed. On narrow layouts allow secondary destructive actions to wrap or enter the existing menu without changing semantics.

- [ ] **Step 5: Run focused tests and confirm green**

Run: `npm test -- src/components/Icon.test.tsx src/components/PlayerBar.test.tsx src/components/PlaylistView.selection.test.tsx`

### Task 4: Comfortable typography, radii, and lyric drawer sizing

**Files:**
- Modify: `src/theme/tokens.css`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces design tokens for system font stacks and 8–14px radii.
- Produces responsive drawer width `clamp(320px, 38vw, 520px)` and rounded internal surfaces.

- [ ] **Step 1: Add CSS behavior assertions to the closest component tests**

Assert semantic class and state changes that drive the CSS: persistent controls use `.compact-icon-btn`, selected actions use `.selection-actions`, and the drawer is omitted in immersive mode. Do not test literal CSS source text.

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `npm test -- src/components/PlayerBar.test.tsx src/components/ImmersiveVisualizer.test.tsx`

- [ ] **Step 3: Implement tokens and layout styles**

Update the platform font stack, typography hierarchy, panel spacing, radii, drawer clamp width, non-wrapping icon toolbar, marquee overlay, selection actions, and drag handle.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `npm test -- src/components/PlayerBar.test.tsx src/components/ImmersiveVisualizer.test.tsx`

### Task 5: True immersive application shell

**Files:**
- Modify: `src/App.tsx`
- Create: `src/App.immersive.test.tsx`
- Modify: `src/components/ImmersiveVisualizer.tsx`
- Modify: `src/components/ImmersiveVisualizer.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes existing playback state and callbacks.
- Produces immersive branch that renders `TitleBar` plus `ImmersiveVisualizer`, but no `Sidebar`, daily view, drawer, or `PlayerBar`.
- Produces compact immersive playback controls inside `ImmersiveVisualizer`.

- [ ] **Step 1: Write failing application-shell tests**

Render `App` with `immersiveMode=true` and assert that the immersive region and exit button exist while navigation, daily drawer, and ordinary player controls do not. Test Escape through the existing playback-shortcut integration.

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `npm test -- src/App.immersive.test.tsx src/components/ImmersiveVisualizer.test.tsx`

- [ ] **Step 3: Move immersive mode to the app-shell branch**

Render a dedicated `.immersive-shell`; pass play/pause, previous, next, seek, time, title, artist, cover and exit callbacks into `ImmersiveVisualizer`. Render an empty immersive state when no current track instead of falling back to the library.

- [ ] **Step 4: Add compact immersive controls and styles**

Keep lyrics centered and place playback controls in a rounded bottom surface. Preserve motion preference and existing audio-reactive particles.

- [ ] **Step 5: Run focused tests and confirm green**

Run: `npm test -- src/App.immersive.test.tsx src/components/ImmersiveVisualizer.test.tsx`

### Task 6: Full verification and handoff

**Files:**
- Modify only files required to fix verified regressions.

**Interfaces:**
- Consumes all earlier tasks.
- Produces a buildable, tested UI update without staging `tsconfig.tsbuildinfo`.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

- [ ] **Step 2: Run the production build**

Run: `npm run build`

- [ ] **Step 3: Inspect changed files and whitespace**

Run: `git diff --check && git status --short && git diff --stat`

- [ ] **Step 4: Compare implementation against every design requirement**

Confirm daily B layout, immersive C shell, all three removal semantics, modifier selection, marquee selection, dedicated reorder handle, responsive lyric drawer, fonts, icons, and radii.
