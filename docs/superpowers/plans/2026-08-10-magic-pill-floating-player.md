# Magic Pill Floating Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent, always-on-top Magic Pill mini-player that hides the main window, mirrors cover-derived playback state, controls playback, and restores the main window on double-click.

**Architecture:** The existing `main` webview remains the only owner of `AudioEngine`, Zustand, queue navigation, and cover extraction. A dedicated `magic-pill` webview renders a serializable snapshot and emits typed commands over Tauri events; a testable controller owns creation, readiness, hiding, restoration, cleanup, and position persistence.

**Tech Stack:** React 18, TypeScript 5.6, Zustand 4, Tauri 2 window/event APIs, CSS, Vitest 4, Testing Library.

## Global Constraints

- Preserve all pre-existing uncommitted work; inspect `git diff` before modifying `src/App.tsx`, `src/styles/global.css`, or any other dirty file and merge changes instead of replacing them.
- Keep `AudioEngine`, the queue, Zustand, cover extraction, and playback side effects mounted only in the `main` webview.
- Use window label `magic-pill`, collapsed size `88 × 88`, and expanded size `326 × 82` logical pixels.
- Hide `main` only after the pill emits readiness; restore `main` when the pill closes unexpectedly.
- The visible controls are song title, artist, previous, play/pause, and next; do not add progress, seeking, volume, lyrics, menus, snapping, or a second audio engine.
- Single-click the core to expand/collapse, double-click the pill to restore `main`, and suppress click actions after a drag.
- Keep the pill always on top, transparent, frameless, and application-resizable only.
- Preserve cover hue while correcting saturation/lightness/contrast; transition palette variables over about `500ms`; use `fallbackPalette(trackId)` when extraction fails.
- Respect `prefers-reduced-motion` and provide accessible names and visible keyboard focus.
- Use complete, revisioned snapshots; ignore stale revisions and invalid commands.

---

## File Structure

- Create `src/magicPill/protocol.ts`: shared event names, snapshot/command types, runtime guards, and revision acceptance.
- Create `src/magicPill/palette.ts`: presentation-safe transformation of `VisualPalette`.
- Create `src/magicPill/geometry.ts`: pure collapsed/expanded positioning and monitor-bound calculations.
- Create `src/magicPill/controller.ts`: dependency-injected main-window lifecycle and Tauri event bridge.
- Create `src/magicPill/tauriAdapter.ts`: concrete Tauri 2 window/event operations and position persistence.
- Create `src/magicPill/useMagicPillBridge.ts`: React hook that publishes main-window snapshots and executes pill commands.
- Create `src/magicPill/MagicPillWindow.tsx`: pill-only React root and window interactions.
- Create `src/magicPill/MagicPillWindow.css`: isolated pill visuals, animation, focus, transparency, and reduced-motion rules.
- Create focused colocated tests for every pure unit, controller, bridge, and component.
- Modify `src/main.tsx`: route by current Tauri window label before mounting either root.
- Modify `src/App.tsx`: build the corrected palette, mount the bridge, and pass the enter action to the title bar.
- Modify `src/components/TitleBar.tsx`: add the discoverable Magic Pill mode button.
- Modify `src/styles/global.css`: add only the main-titlebar button style needed by the new action.
- Modify `src-tauri/capabilities/default.json`: authorize both labels and the exact window/event operations used.

---

### Task 1: Presentation-Safe Cover Palette

**Files:**
- Create: `src/magicPill/palette.ts`
- Test: `src/magicPill/palette.test.ts`

**Interfaces:**
- Consumes: `VisualPalette` from `src/visualizer/palette.ts`.
- Produces: `export function tuneMagicPillPalette(palette: VisualPalette): VisualPalette`.

- [ ] **Step 1: Write failing palette tests**

```ts
import { describe, expect, it } from 'vitest';
import { tuneMagicPillPalette } from './palette';

describe('tuneMagicPillPalette', () => {
  it('preserves hue families while lifting a muddy palette into visible ranges', () => {
    const tuned = tuneMagicPillPalette({ colors: ['rgb(30 35 40)', 'rgb(42 46 51)', 'rgb(55 59 63)'] });
    expect(tuned.colors).toHaveLength(3);
    expect(tuned.colors).not.toEqual(['rgb(30 35 40)', 'rgb(42 46 51)', 'rgb(55 59 63)']);
    for (const color of tuned.colors) expect(color).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('is deterministic and does not mutate the extracted palette', () => {
    const source = { colors: ['rgb(244 240 232)', 'rgb(224 90 72)', 'rgb(28 42 62)'] } as const;
    const first = tuneMagicPillPalette(source);
    expect(tuneMagicPillPalette(source)).toEqual(first);
    expect(source.colors[0]).toBe('rgb(244 240 232)');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `npm test -- src/magicPill/palette.test.ts`

Expected: FAIL because `./palette` does not exist.

- [ ] **Step 3: Implement RGB parsing, RGB↔HSL conversion, bounded saturation/lightness correction, and the public transform**

```ts
import type { VisualPalette } from '../visualizer/palette';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function tuneMagicPillPalette(palette: VisualPalette): VisualPalette {
  return {
    colors: palette.colors.map((color, index) => {
      const rgb = parseRgb(color);
      const hsl = rgbToHsl(rgb);
      const saturation = clamp(hsl.s, index === 0 ? 0.48 : 0.38, 0.82);
      const lightness = clamp(hsl.l, index === 0 ? 0.58 : 0.28, index === 0 ? 0.72 : 0.58);
      const result = hslToRgb({ h: hsl.h, s: saturation, l: lightness });
      return `rgb(${Math.round(result.r)} ${Math.round(result.g)} ${Math.round(result.b)})`;
    }) as [string, string, string],
  };
}
```

Keep `parseRgb`, `rgbToHsl`, and `hslToRgb` private and total for the existing `rgb(r g b)` format. Throw a clear `Error('Invalid RGB color: ...')` only for input outside the `VisualPalette` contract.

- [ ] **Step 4: Run palette tests and the existing palette suite**

Run: `npm test -- src/magicPill/palette.test.ts src/visualizer/palette.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the palette unit**

```bash
git add src/magicPill/palette.ts src/magicPill/palette.test.ts
git commit -m "feat: tune cover colors for magic pill"
```

---

### Task 2: Typed Protocol and Window Geometry

**Files:**
- Create: `src/magicPill/protocol.ts`
- Create: `src/magicPill/protocol.test.ts`
- Create: `src/magicPill/geometry.ts`
- Create: `src/magicPill/geometry.test.ts`

**Interfaces:**
- Produces: `MAGIC_PILL_READY`, `MAGIC_PILL_SNAPSHOT`, `MAGIC_PILL_COMMAND`, `MagicPillSnapshot`, `MagicPillCommand`, `isMagicPillCommand`, `acceptSnapshot`.
- Produces: `COLLAPSED_SIZE`, `EXPANDED_SIZE`, `pillPositionForState(position, workArea, expanded)` and `firstPillPosition(workArea)`.

- [ ] **Step 1: Write failing protocol tests**

```ts
import { describe, expect, it } from 'vitest';
import { acceptSnapshot, isMagicPillCommand, type MagicPillSnapshot } from './protocol';

const snapshot = (revision: number): MagicPillSnapshot => ({
  version: 1, revision, trackId: 7, title: '风景与你', artist: 'Peter',
  palette: ['rgb(220 120 80)', 'rgb(90 50 120)', 'rgb(24 20 35)'], isPlaying: true,
});

it('accepts only known commands', () => {
  expect(isMagicPillCommand({ type: 'next' })).toBe(true);
  expect(isMagicPillCommand({ type: 'seek', time: 4 })).toBe(false);
  expect(isMagicPillCommand(null)).toBe(false);
});

it('rejects snapshots at or below the current revision', () => {
  expect(acceptSnapshot(4, snapshot(5))).toEqual(snapshot(5));
  expect(acceptSnapshot(5, snapshot(5))).toBeNull();
  expect(acceptSnapshot(6, snapshot(5))).toBeNull();
});
```

- [ ] **Step 2: Write failing geometry tests**

```ts
import { describe, expect, it } from 'vitest';
import { firstPillPosition, pillPositionForState } from './geometry';

const workArea = { x: 0, y: 24, width: 1440, height: 876 };

it('places first use near the usable top-right corner', () => {
  expect(firstPillPosition(workArea)).toEqual({ x: 1332, y: 44 });
});

it('expands left when rightward growth would leave the monitor', () => {
  expect(pillPositionForState({ x: 1332, y: 44 }, workArea, true)).toEqual({ x: 1094, y: 44 });
});
```

- [ ] **Step 3: Run both tests and confirm missing module failures**

Run: `npm test -- src/magicPill/protocol.test.ts src/magicPill/geometry.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement exact protocol contracts and guards**

```ts
export const MAGIC_PILL_READY = 'magic-pill://ready';
export const MAGIC_PILL_SNAPSHOT = 'magic-pill://snapshot';
export const MAGIC_PILL_COMMAND = 'magic-pill://command';

export interface MagicPillSnapshot {
  version: 1;
  revision: number;
  trackId: number | null;
  title: string;
  artist: string;
  palette: [string, string, string];
  isPlaying: boolean;
}

export type MagicPillCommand =
  | { type: 'previous' }
  | { type: 'toggle-playback' }
  | { type: 'next' }
  | { type: 'restore-main' };

const COMMANDS = new Set(['previous', 'toggle-playback', 'next', 'restore-main']);
export const isMagicPillCommand = (value: unknown): value is MagicPillCommand =>
  typeof value === 'object' && value !== null &&
  COMMANDS.has((value as { type?: unknown }).type as string);

export const acceptSnapshot = (currentRevision: number, next: MagicPillSnapshot) =>
  next.version === 1 && next.revision > currentRevision ? next : null;
```

- [ ] **Step 5: Implement monitor-safe geometry**

```ts
export const COLLAPSED_SIZE = { width: 88, height: 88 } as const;
export const EXPANDED_SIZE = { width: 326, height: 82 } as const;
export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

const MARGIN = 20;
export const firstPillPosition = (area: Rect): Point => ({
  x: area.x + area.width - COLLAPSED_SIZE.width - MARGIN,
  y: area.y + MARGIN,
});

export function pillPositionForState(position: Point, area: Rect, expanded: boolean): Point {
  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
  const right = area.x + area.width;
  return {
    x: Math.max(area.x, Math.min(position.x, right - size.width)),
    y: Math.max(area.y, Math.min(position.y, area.y + area.height - size.height)),
  };
}
```

- [ ] **Step 6: Run both focused suites**

Run: `npm test -- src/magicPill/protocol.test.ts src/magicPill/geometry.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the shared contracts**

```bash
git add src/magicPill/protocol.ts src/magicPill/protocol.test.ts src/magicPill/geometry.ts src/magicPill/geometry.test.ts
git commit -m "feat: define magic pill protocol and geometry"
```

---

### Task 3: Testable Main-Window Lifecycle Controller

**Files:**
- Create: `src/magicPill/controller.ts`
- Test: `src/magicPill/controller.test.ts`

**Interfaces:**
- Consumes: protocol event names and `MagicPillSnapshot` / `MagicPillCommand`.
- Produces: `MagicPillPlatform`, `MagicPillController`, `createMagicPillController(platform)`.

- [ ] **Step 1: Write failing controller lifecycle tests with an in-memory platform fake**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMagicPillController, type MagicPillPlatform } from './controller';

const snapshot = () => ({
  version: 1 as const,
  revision: 1,
  trackId: null,
  title: '未播放',
  artist: '',
  palette: ['rgb(1 1 1)', 'rgb(2 2 2)', 'rgb(3 3 3)'] as [string, string, string],
  isPlaying: false,
});

function platformFake(): MagicPillPlatform {
  return {
    createOrFocusPill: vi.fn(async () => undefined),
    waitUntilReady: vi.fn(async () => undefined),
    sendSnapshot: vi.fn(async () => undefined),
    hideMain: vi.fn(async () => undefined),
    showAndFocusMain: vi.fn(async () => undefined),
    closePill: vi.fn(async () => undefined),
    onCommand: vi.fn(async () => () => undefined),
    onPillDestroyed: vi.fn(async () => () => undefined),
  };
}

it('hides main only after readiness and initial snapshot', async () => {
  const platform = platformFake();
  const controller = createMagicPillController(platform);
  await controller.enter(snapshot());
  expect(platform.waitUntilReady).toHaveBeenCalledBefore(platform.sendSnapshot as ReturnType<typeof vi.fn>);
  expect(platform.sendSnapshot).toHaveBeenCalledBefore(platform.hideMain as ReturnType<typeof vi.fn>);
});

it('keeps main available and closes a partial pill when readiness fails', async () => {
  const platform = platformFake();
  vi.mocked(platform.waitUntilReady).mockRejectedValue(new Error('ready timeout'));
  const controller = createMagicPillController(platform);
  await expect(controller.enter(snapshot())).rejects.toThrow('ready timeout');
  expect(platform.hideMain).not.toHaveBeenCalled();
  expect(platform.closePill).toHaveBeenCalledOnce();
});

it('restores main when the pill is destroyed unexpectedly', async () => {
  const platform = platformFake();
  let destroyed = () => undefined;
  vi.mocked(platform.onPillDestroyed).mockImplementation(async (handler) => { destroyed = handler; return () => undefined; });
  const controller = createMagicPillController(platform);
  await controller.enter(snapshot());
  destroyed();
  expect(platform.showAndFocusMain).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the controller test and confirm the missing module failure**

Run: `npm test -- src/magicPill/controller.test.ts`

Expected: FAIL because `./controller` is absent.

- [ ] **Step 3: Implement the dependency-injected controller**

```ts
export interface MagicPillPlatform {
  createOrFocusPill(): Promise<void>;
  waitUntilReady(timeoutMs: number): Promise<void>;
  sendSnapshot(snapshot: MagicPillSnapshot): Promise<void>;
  hideMain(): Promise<void>;
  showAndFocusMain(): Promise<void>;
  closePill(): Promise<void>;
  onCommand(handler: (command: unknown) => void): Promise<() => void>;
  onPillDestroyed(handler: () => void): Promise<() => void>;
}

export interface MagicPillController {
  setCommandHandler(handler: (command: MagicPillCommand) => void): void;
  enter(initial: MagicPillSnapshot): Promise<void>;
  publish(snapshot: MagicPillSnapshot): Promise<void>;
  restore(): Promise<void>;
  dispose(): void;
}
```

Implementation rules:

- Guard `enter()` with one in-flight promise so repeated title-bar clicks cannot create duplicates.
- Register command/destruction listeners before waiting for readiness.
- Use a `restoring` flag so intentional `closePill()` does not trigger a second restore.
- In `restore()`, await `showAndFocusMain()` before `closePill()`.
- On an `enter()` error, call `closePill()`, dispose temporary listeners, leave main visible, reset the in-flight promise, and rethrow.
- `publish()` is a no-op until the active pill is ready.

- [ ] **Step 4: Add controller tests for duplicate entry, restore ordering, unknown commands, and listener cleanup**

Assert:

```ts
await Promise.all([controller.enter(snapshot()), controller.enter(snapshot())]);
expect(platform.createOrFocusPill).toHaveBeenCalledOnce();

await controller.restore();
expect(platform.showAndFocusMain).toHaveBeenCalledBefore(platform.closePill as ReturnType<typeof vi.fn>);
```

Capture unlisten spies returned by `onCommand` and `onPillDestroyed`; assert both run once on `dispose()` and after failed entry. Pass `{ type: 'seek' }` through the captured command handler and assert the application handler is not called.

- [ ] **Step 5: Run the focused controller suite**

Run: `npm test -- src/magicPill/controller.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the lifecycle controller**

```bash
git add src/magicPill/controller.ts src/magicPill/controller.test.ts
git commit -m "feat: manage magic pill window lifecycle"
```

---

### Task 4: Concrete Tauri Adapter and Position Persistence

**Files:**
- Create: `src/magicPill/tauriAdapter.ts`
- Test: `src/magicPill/tauriAdapter.test.ts`

**Interfaces:**
- Consumes: `MagicPillPlatform`, event constants, geometry functions.
- Produces: `createTauriMagicPillPlatform(): MagicPillPlatform`, `loadSavedPillPosition`, `savePillPosition`.

- [ ] **Step 1: Write failing persistence tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadSavedPillPosition, savePillPosition } from './tauriAdapter';

it('round-trips a valid last position', () => {
  const storage = new Map<string, string>();
  const target = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) };
  savePillPosition(target, { x: 120, y: 80 });
  expect(loadSavedPillPosition(target)).toEqual({ x: 120, y: 80 });
});

it('rejects malformed and non-finite positions', () => {
  const target = { getItem: () => '{"x":"bad","y":5}' };
  expect(loadSavedPillPosition(target)).toBeNull();
});
```

- [ ] **Step 2: Run the adapter test and confirm failure**

Run: `npm test -- src/magicPill/tauriAdapter.test.ts`

Expected: FAIL because `./tauriAdapter` is missing.

- [ ] **Step 3: Implement persistence and the concrete Tauri adapter**

Use these exact Tauri 2 APIs already installed in `node_modules`:

```ts
import { emitTo, listen } from '@tauri-apps/api/event';
import { LogicalPosition, WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
```

If `LogicalPosition` is not re-exported from `webviewWindow` by TypeScript, import it from `@tauri-apps/api/dpi` instead. Construct the pill with:

```ts
new WebviewWindow('magic-pill', {
  title: 'Soul Play Magic Pill', width: 88, height: 88,
  decorations: false, transparent: true, alwaysOnTop: true,
  resizable: false, skipTaskbar: true, shadow: false, visible: true,
  x: position.x, y: position.y,
});
```

Implementation details:

- Reuse `await WebviewWindow.getByLabel('magic-pill')` if it already exists.
- Resolve initial position from `lumen.magic-pill.position`; clamp it through `pillPositionForState`; otherwise use `firstPillPosition` on the current monitor's logical work area.
- `waitUntilReady(4000)` listens for `MAGIC_PILL_READY`, scopes the source label to `magic-pill`, and rejects after 4 seconds while always clearing the timer/listener.
- `sendSnapshot` uses `emitTo('magic-pill', MAGIC_PILL_SNAPSHOT, snapshot)`.
- `onCommand` uses `listen(MAGIC_PILL_COMMAND, ...)` and passes `event.payload`.
- Track close/destroy using the window close/destroy event supported by the installed Tauri API; ensure intentional close is handled by the controller guard.
- Main show/focus uses `getCurrentWindow().show()` and `.setFocus()`; main hide uses `.hide()`.
- Subscribe to pill `onMoved`, convert physical coordinates using the window scale factor, and save only the collapsed anchor position.

- [ ] **Step 4: Mock Tauri modules and test creation options, ready timeout cleanup, and targeted snapshot emission**

Use `vi.mock('@tauri-apps/api/webviewWindow', ...)`, `vi.mock('@tauri-apps/api/window', ...)`, and `vi.mock('@tauri-apps/api/event', ...)`. Assert the constructor receives `transparent: true`, `alwaysOnTop: true`, `decorations: false`, and `resizable: false`; use fake timers to advance `4000ms` and assert the ready listener unlistens exactly once.

- [ ] **Step 5: Run adapter and preceding core tests**

Run: `npm test -- src/magicPill/tauriAdapter.test.ts src/magicPill/controller.test.ts src/magicPill/geometry.test.ts src/magicPill/protocol.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the Tauri adapter**

```bash
git add src/magicPill/tauriAdapter.ts src/magicPill/tauriAdapter.test.ts
git commit -m "feat: connect magic pill to tauri windows"
```

---

### Task 5: Magic Pill React Window and Gesture Arbitration

**Files:**
- Create: `src/magicPill/gesture.ts`
- Create: `src/magicPill/gesture.test.ts`
- Create: `src/magicPill/MagicPillWindow.tsx`
- Create: `src/magicPill/MagicPillWindow.test.tsx`
- Create: `src/magicPill/MagicPillWindow.css`

**Interfaces:**
- Consumes: protocol snapshot/command contracts, geometry sizes, Tauri current window APIs.
- Produces: default `MagicPillWindow` component; `classifyPillGesture(start, end, elapsedMs)` returning `'click' | 'drag'`.

- [ ] **Step 1: Write failing gesture tests**

```ts
import { expect, it } from 'vitest';
import { classifyPillGesture } from './gesture';

it('separates click from drag with a four-pixel movement threshold', () => {
  expect(classifyPillGesture({ x: 10, y: 10 }, { x: 12, y: 12 }, 100)).toBe('click');
  expect(classifyPillGesture({ x: 10, y: 10 }, { x: 18, y: 10 }, 100)).toBe('drag');
});
```

- [ ] **Step 2: Write failing component tests**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MagicPillWindow from './MagicPillWindow';

it('renders the snapshot and only approved playback controls when expanded', () => {
  render(<MagicPillWindow platform={pillPlatformFake()} />);
  platformSnapshotHandler(snapshot({ title: '乌兰巴托的夜', artist: '声音碎片' }));
  fireEvent.click(screen.getByRole('button', { name: '展开魔丸' }));
  expect(screen.getByText('乌兰巴托的夜')).toBeInTheDocument();
  expect(screen.getByText('声音碎片')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '上一首' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '下一首' })).toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});

it('emits restore-main on double click', () => {
  const platform = pillPlatformFake();
  render(<MagicPillWindow platform={platform} />);
  fireEvent.doubleClick(screen.getByTestId('magic-pill-surface'));
  expect(platform.emitCommand).toHaveBeenCalledWith({ type: 'restore-main' });
});
```

Define `MagicPillViewPlatform` in the component file with `onSnapshot`, `emitReady`, `emitCommand`, `resize`, `collapseOnBlur`, and `startDragging`; implement `pillPlatformFake()` and `platformSnapshotHandler` as real test helpers in the test file.

- [ ] **Step 3: Run tests and confirm missing module failures**

Run: `npm test -- src/magicPill/gesture.test.ts src/magicPill/MagicPillWindow.test.tsx`

Expected: FAIL because the files do not exist.

- [ ] **Step 4: Implement gesture classification and the pill component**

Component behavior:

- Start with a neutral dormant snapshot at revision `-1`.
- On mount, subscribe before emitting `MAGIC_PILL_READY` so the initial snapshot cannot be missed.
- Accept only newer revisions via `acceptSnapshot`.
- Set CSS variables `--pill-bright`, `--pill-body`, and `--pill-shadow` from the snapshot palette.
- Single-click the core toggles expanded state and awaits resize/position adjustment.
- Button clicks stop propagation and emit the exact typed commands.
- Double-click anywhere on the non-control surface emits `{ type: 'restore-main' }` and suppresses the pending single-click toggle using a `220ms` click timer.
- Pointer movement above four pixels starts/continues dragging and cancels click/double-click behavior.
- Window blur collapses an expanded pill.

- [ ] **Step 5: Implement the approved visual design and accessibility CSS**

Required selectors and values:

```css
html.magic-pill-root, body.magic-pill-root, #root { background: transparent; overflow: hidden; }
.magic-pill { width: 100%; height: 100%; border-radius: 999px; background: linear-gradient(145deg, rgba(26,27,32,.97), rgba(5,6,8,.99)); }
.magic-pill__core { width: 62px; height: 62px; border-radius: 50%; transition: background 500ms ease, box-shadow 500ms ease; }
.magic-pill[data-playing="true"] .magic-pill__core { animation: pill-breathe 2.8s ease-in-out infinite; }
.magic-pill__title, .magic-pill__artist { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.magic-pill button:focus-visible { outline: 2px solid var(--pill-bright); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .magic-pill__core { animation: none !important; transition-duration: 80ms; } }
```

Keep the collapsed DOM free of visually hidden playback buttons; render controls only while expanded so tab order matches visibility.

- [ ] **Step 6: Add component tests for stale snapshots, pause icon, blur collapse, button commands, drag suppression, loading state, and accessible names**

Use `vi.useFakeTimers()` for single/double-click arbitration. Verify a snapshot revision `2` followed by revision `1` leaves revision `2` content rendered. Verify pointer movement beyond four pixels calls `startDragging` but does not call `resize` or `emitCommand`.

- [ ] **Step 7: Run focused component tests**

Run: `npm test -- src/magicPill/gesture.test.ts src/magicPill/MagicPillWindow.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the pill UI**

```bash
git add src/magicPill/gesture.ts src/magicPill/gesture.test.ts src/magicPill/MagicPillWindow.tsx src/magicPill/MagicPillWindow.test.tsx src/magicPill/MagicPillWindow.css
git commit -m "feat: render interactive magic pill window"
```

---

### Task 6: Main-Window State Bridge and Playback Commands

**Files:**
- Create: `src/magicPill/useMagicPillBridge.ts`
- Create: `src/magicPill/useMagicPillBridge.test.tsx`
- Modify: `src/App.tsx:18-86, 265-281, 373-402`

**Interfaces:**
- Consumes: `MagicPillController`, `extractCoverPalette`, `fallbackPalette`, `tuneMagicPillPalette`, current track/store state, existing `handlePrev`, `handleTogglePlay`, `handleNext`.
- Produces: `useMagicPillBridge(input): { enterMagicPill(): Promise<void> }`.

- [ ] **Step 1: Write a failing hook test for snapshot publication and command execution**

```tsx
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useMagicPillBridge } from './useMagicPillBridge';

it('enters with a complete snapshot and maps validated commands to existing actions', async () => {
  const controller = controllerFake();
  const actions = { previous: vi.fn(), togglePlayback: vi.fn(), next: vi.fn() };
  const { result } = renderHook(() => useMagicPillBridge({
    controller, trackId: 9, title: '风景与你', artist: 'Peter', isPlaying: true,
    palette: ['rgb(220 120 80)', 'rgb(90 50 120)', 'rgb(24 20 35)'], actions,
  }));
  await act(() => result.current.enterMagicPill());
  expect(controller.enter).toHaveBeenCalledWith(expect.objectContaining({ version: 1, trackId: 9, revision: 1 }));
  controllerCommandHandler({ type: 'next' });
  expect(actions.next).toHaveBeenCalledOnce();
});
```

Implement the fake and captured handler as concrete helpers; the controller fake must expose `enter`, `publish`, `restore`, `dispose`, and a handler registration mechanism matching the final controller interface.

- [ ] **Step 2: Run the hook test and confirm the missing module failure**

Run: `npm test -- src/magicPill/useMagicPillBridge.test.tsx`

Expected: FAIL because the hook is absent.

- [ ] **Step 3: Implement the hook with stable revision and command callbacks**

```ts
export interface UseMagicPillBridgeInput {
  controller: MagicPillController;
  trackId: number | null;
  title: string;
  artist: string;
  isPlaying: boolean;
  palette: [string, string, string];
  actions: { previous(): void; togglePlayback(): void; next(): void };
}
```

- Keep the revision in a `useRef(0)` and increment only when producing a new complete snapshot.
- Keep the latest actions in refs so the controller listener is registered once but never calls stale callbacks.
- On relevant input change, call `controller.publish(snapshot)`; it safely no-ops before entry.
- Map `restore-main` to `controller.restore()` and the other three commands to the supplied existing actions.
- Dispose the controller on unmount.

- [ ] **Step 4: Integrate corrected palette state and the bridge in `App.tsx`**

Merge with existing dirty changes. Replace the single-color-only palette effect with state that always holds the complete tuned palette:

```ts
const [magicPillPalette, setMagicPillPalette] = useState(() =>
  tuneMagicPillPalette(fallbackPalette(String(currentTrackId ?? 'peter-player'))).colors,
);
```

On `coverArt`/track change, set the tuned fallback immediately, then extract and tune the cover palette when available. Continue updating `--ambient-color` from `colors[0]` so existing visuals do not regress.

Create the controller once with `useMemo(() => createMagicPillController(createTauriMagicPillPlatform()), [])` or a lazy `useRef`; do not reconstruct it on playback renders. Pass `handlePrev`, `handleTogglePlay`, and `handleNext` to the hook. Provide `enterMagicPill` to `<TitleBar onEnterMagicPill={enterMagicPill} />`.

- [ ] **Step 5: Add hook tests for revision increments, fallback snapshot values, stale callback avoidance, publish-before-entry no-op, and cleanup**

Rerender the hook with a new title and assert the next published snapshot has `revision: 2`. Update the `next` spy through rerender, trigger the captured command, and assert only the latest spy runs.

- [ ] **Step 6: Run hook, App, palette, and playback tests**

Run: `npm test -- src/magicPill/useMagicPillBridge.test.tsx src/magicPill/palette.test.ts src/components/PlayerBar.test.tsx src/components/AppShell.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the main-window bridge**

```bash
git add src/magicPill/useMagicPillBridge.ts src/magicPill/useMagicPillBridge.test.tsx src/App.tsx
git commit -m "feat: bridge playback state to magic pill"
```

---

### Task 7: Window Routing, Entry Control, and Tauri Permissions

**Files:**
- Create: `src/windowRoot.tsx`
- Create: `src/windowRoot.test.tsx`
- Modify: `src/main.tsx:1-12`
- Modify: `src/components/TitleBar.tsx:1-58`
- Create: `src/components/TitleBar.test.tsx`
- Modify: `src/styles/global.css`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: current Tauri window label, `App`, `MagicPillWindow`, and `onEnterMagicPill` callback.
- Produces: `windowRootForLabel(label)` and titlebar Magic Pill action.

- [ ] **Step 1: Write failing routing tests**

```tsx
import { expect, it } from 'vitest';
import { windowRootForLabel } from './windowRoot';

it('routes only the dedicated label to the pill root', () => {
  expect(windowRootForLabel('magic-pill')).toBe('magic-pill');
  expect(windowRootForLabel('main')).toBe('main');
  expect(windowRootForLabel('unexpected')).toBe('main');
});
```

- [ ] **Step 2: Write a failing titlebar action test**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import TitleBar from './TitleBar';

it('exposes and invokes Magic Pill mode', () => {
  const onEnterMagicPill = vi.fn();
  render(<TitleBar onEnterMagicPill={onEnterMagicPill} />);
  fireEvent.click(screen.getByRole('button', { name: '进入魔丸模式' }));
  expect(onEnterMagicPill).toHaveBeenCalledOnce();
});
```

Mock `@tauri-apps/api/window` before importing `TitleBar` so its module-level `getCurrentWindow()` does not invoke the real runtime.

- [ ] **Step 3: Run the two tests and confirm failures**

Run: `npm test -- src/windowRoot.test.tsx src/components/TitleBar.test.tsx`

Expected: FAIL because the router is absent and `TitleBar` has no prop/action.

- [ ] **Step 4: Implement window-root routing before mounting React**

```tsx
export type WindowRoot = 'main' | 'magic-pill';
export const windowRootForLabel = (label: string): WindowRoot => label === 'magic-pill' ? 'magic-pill' : 'main';
```

In `src/main.tsx`, call `getCurrentWindow().label` once, add `magic-pill-root` to both `html` and `body` for the pill label, and render `<MagicPillWindow />`; otherwise render `<App />`. Keep `React.StrictMode` for both roots and do not import or mount `App` conditionally inside the component body.

- [ ] **Step 5: Add the titlebar button and focused styling**

Change the signature to:

```ts
export interface TitleBarProps { onEnterMagicPill: () => void | Promise<void> }
export default function TitleBar({ onEnterMagicPill }: TitleBarProps) { /* existing controls */ }
```

Add a button before minimize with `aria-label="进入魔丸模式"`, `title="缩小为魔丸浮窗"`, an inline circular-core SVG, propagation suppression matching the other controls, and a guarded async click that logs a creation error without hiding the main window. Add a `.titlebar-magic-pill` hover/focus color using existing theme tokens; do not restyle unrelated controls.

- [ ] **Step 6: Grant exact Tauri capabilities to both windows**

Change `windows` to `['main', 'magic-pill']`. Add the permissions required by the installed Tauri 2 schema for:

- creating a webview window;
- show, hide, set focus, close;
- set size and position;
- query scale factor, monitor, position, and listen for move/close/destroy;
- start dragging;
- emit and listen to application events.

Use `npm run tauri -- build --debug` schema validation as the authority for exact permission identifiers. Do not add broad shell, filesystem, or network permissions for `magic-pill`; retain existing main-window permissions needed by the application.

- [ ] **Step 7: Run focused routing/titlebar tests and TypeScript build**

Run: `npm test -- src/windowRoot.test.tsx src/components/TitleBar.test.tsx src/magicPill/MagicPillWindow.test.tsx`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite build succeed.

- [ ] **Step 8: Commit routing and permissions**

```bash
git add src/windowRoot.tsx src/windowRoot.test.tsx src/main.tsx src/components/TitleBar.tsx src/components/TitleBar.test.tsx src/styles/global.css src-tauri/capabilities/default.json
git commit -m "feat: launch magic pill from main window"
```

---

### Task 8: Full Verification and Desktop Acceptance

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1-7.

**Interfaces:**
- Consumes: the complete feature.
- Produces: a verified desktop workflow with no known scope regressions.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all Vitest suites pass with no unhandled rejection or leaked-timer warnings.

- [ ] **Step 2: Run the production frontend build**

Run: `npm run build`

Expected: `tsc -b && vite build` exits `0`.

- [ ] **Step 3: Validate the Tauri bundle and capability schema**

Run: `npm run tauri -- build --debug`

Expected: Rust compilation and Tauri capability validation exit `0`.

- [ ] **Step 4: Launch the desktop app and perform the acceptance script**

Run: `npm run tauri -- dev`

Verify in order:

1. Start a track and enter Magic Pill mode from the title bar.
2. Confirm the pill appears before the main window hides and audio never stops.
3. Confirm collapsed size is 88 × 88, background corners are transparent, and the pill stays above a normal window.
4. Confirm the core colors correspond to the current cover and transition smoothly after changing tracks.
5. Single-click to expand; confirm 326 × 82, title/artist truncation, and exactly previous/play-pause/next controls.
6. Exercise all three playback controls and confirm the main-owned queue/audio responds once per click.
7. Drag the pill and confirm no accidental expansion; exit/re-enter and confirm position restoration.
8. Move near the right edge, expand, and confirm the capsule remains fully visible.
9. Click outside and confirm collapse; double-click and confirm the main window appears and focuses before the pill closes.
10. Re-enter, close/crash the pill through the window inspector if available, and confirm the main window restores.
11. Enable reduced motion at OS level and confirm breathing stops.

- [ ] **Step 5: Inspect the final diff for scope and accidental user-change loss**

Run: `git status --short && git diff --check && git diff --stat`

Expected: no whitespace errors, no generated `.superpowers/` files, no unrelated refactors, and all pre-existing user changes remain represented.

- [ ] **Step 6: Close verification with a clean feature diff**

If Step 4 exposed a defect, return to the task that owns that exact file, add a regression test there, run that task's focused command, and use that task's explicit `git add` file list before committing `fix: harden magic pill desktop workflow`. If Step 4 required no changes, do not create an empty commit.

---

## Completion Evidence

Record these outputs in the final handoff:

- `npm test` summary with passed test/file counts.
- `npm run build` success.
- `npm run tauri -- build --debug` success.
- Manual acceptance results, including OS and whether transparency/always-on-top/reduced-motion were verified.
- Final commit list and any pre-existing uncommitted files intentionally left untouched.
