# Playback Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe application-level keyboard controls for playback, navigation, volume, drawers, mute, and immersive mode.

**Architecture:** Keep keyboard interpretation in a framework-independent module and register one React hook at the app boundary. The interpreter returns semantic commands; App maps commands to existing store/audio actions, while a hook-local ref remembers the last non-zero volume for mute restoration.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library.

## Global Constraints

- Editable controls suppress every shortcut except Escape.
- Browser defaults are prevented only when a shortcut is handled.
- Toggle/navigation commands ignore repeated keydown events.
- Seek and volume commands may repeat and clamp to valid bounds.
- Listeners are registered once and always cleaned up.
- No new runtime dependency.

---

### Task 1: Pure Shortcut Interpreter

**Files:**
- Create: `src/keyboard/playbackShortcuts.ts`
- Create: `src/keyboard/playbackShortcuts.test.ts`

**Interfaces:**
- Produces: `PlaybackShortcutCommand` union.
- Produces: `isEditableShortcutTarget(target: EventTarget | null): boolean`.
- Produces: `resolvePlaybackShortcut(event: KeyboardEvent): PlaybackShortcutCommand | null`.

- [ ] **Step 1: Write failing command-mapping tests**

Cover Space, arrows, Shift+arrows, I/L/E/M, Escape, repeat suppression, unknown keys, and editable targets with literal expected commands.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/keyboard/playbackShortcuts.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal interpreter**

Return semantic commands: `toggle-play`, `seek-relative`, `track-relative`, `volume-relative`, `toggle-immersive`, `toggle-lyrics`, `toggle-eq`, `toggle-mute`, or `escape`. Check `event.repeat` only for toggles/navigation. Treat INPUT, TEXTAREA, SELECT, and contenteditable ancestors as editable.

- [ ] **Step 4: Verify the interpreter**

Run: `npm test -- src/keyboard/playbackShortcuts.test.ts`

Expected: all focused tests pass.

### Task 2: React Hook and App Integration

**Files:**
- Create: `src/keyboard/usePlaybackShortcuts.ts`
- Create: `src/keyboard/usePlaybackShortcuts.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `resolvePlaybackShortcut` from Task 1.
- Produces: `usePlaybackShortcuts(actions: PlaybackShortcutActions): void`.
- `PlaybackShortcutActions` exposes current playback/drawer state and bounded action callbacks.

- [ ] **Step 1: Write failing hook tests**

Render a harness using real DOM keyboard events. Assert Space invokes play/pause, ArrowRight seeks +5 seconds, ArrowUp clamps volume at 1, M restores the previous non-zero volume, Escape exits immersive before closing drawers, and unmount removes the listener.

- [ ] **Step 2: Run focused hook tests**

Run: `npm test -- src/keyboard/usePlaybackShortcuts.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Use one `keydown` listener. Keep latest actions in a ref so the listener is stable. Keep last non-zero volume in a second ref. Call `preventDefault()` only after resolving a command that can act in the current state.

- [ ] **Step 4: Integrate with App**

Map commands to `audioEngine.seek`, existing playNext/playPrev, store setters, immersive state, lyrics/EQ toggles, and modal/drawer close actions. Clamp seek to `[0, duration]` and volume to `[0, 1]`. Escape priority is immersive, batch editor, then lyrics/EQ drawer.

- [ ] **Step 5: Verify hook tests and production build**

Run: `npm test -- src/keyboard/usePlaybackShortcuts.test.tsx`

Expected: focused tests pass.

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

### Task 3: Discoverability and Regression Verification

**Files:**
- Modify: `src/components/PlayerBar.tsx`
- Test: `src/components/PlayerBar.test.tsx`

**Interfaces:**
- Consumes existing PlayerBar props; produces updated accessible titles only.

- [ ] **Step 1: Write failing title tests**

Assert playback, previous/next, lyrics, EQ, and immersive controls include their shortcut keys in accessible titles without changing button roles.

- [ ] **Step 2: Update control titles**

Use concise Chinese labels such as `播放（Space）`, `歌词（L）`, and `沉浸模式（I）`. Keep accessible names stable with explicit `aria-label` where existing tests depend on them.

- [ ] **Step 3: Run complete verification**

Run: `npm test && npm run build && git diff --check`

Expected: all tests pass, build exits 0, and no whitespace errors are reported.

- [ ] **Step 4: Commit**

```bash
git add src/keyboard src/App.tsx src/components/PlayerBar.tsx src/components/PlayerBar.test.tsx
git commit -m "feat: add global playback shortcuts"
```
