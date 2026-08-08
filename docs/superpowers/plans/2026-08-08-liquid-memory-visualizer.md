# Liquid Memory Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight local audio-reactive ambient treatment and immersive Liquid Memory view to Peter Player.

**Architecture:** Extend the existing Web Audio graph with an `AnalyserNode`, derive smoothed audio and mood signals in framework-independent modules, and render those signals directly through CSS properties plus a bounded Canvas 2D particle pool. Keep only durable UI switches in Zustand so the animation loop never causes React-wide rerenders.

**Tech Stack:** React 18, TypeScript 5.6, Zustand 4, Web Audio API, Canvas 2D, CSS, Vitest.

## Global Constraints

- No WebGL and no new runtime visualization dependency.
- Visual updates are capped near 30 FPS.
- The Canvas particle pool never exceeds 36 particles.
- Analysis and rendering stop while the document is hidden or playback is inactive.
- `prefers-reduced-motion` disables drifting, particles, pressure rings, and pulsing by default.
- Per-frame analysis values never enter React state or the Zustand store.
- Existing EQ, playback, lyrics, and playlist behavior must remain unchanged.

---

## File Structure

- `src/audio/AudioEngine.ts`: own and expose the Web Audio `AnalyserNode`.
- `src/audio/reactiveAnalysis.ts`: normalize bands, smooth signals, detect beats, and infer blended mood.
- `src/audio/reactiveAnalysis.test.ts`: deterministic synthetic-array tests for analysis and mood logic.
- `src/visualizer/palette.ts`: extract and fall back to a compact cover palette.
- `src/visualizer/palette.test.ts`: deterministic fallback and color-format tests.
- `src/visualizer/ParticleField.ts`: allocation-bounded Canvas 2D particle/ring renderer.
- `src/components/ImmersiveVisualizer.tsx`: lifecycle, palette, direct DOM/CSS updates, metadata, and motion toggle.
- `src/components/PlayerBar.tsx`: immersive toggle and ambient CSS target attributes.
- `src/store/useStore.ts`: durable `immersiveMode` and `reactiveMotionEnabled` state only.
- `src/App.tsx`: mount the immersive view, wire controls, and handle Escape.
- `src/styles/global.css`: ambient and immersive presentation, responsive layout, reduced-motion rules.
- `package.json` / `package-lock.json`: add Vitest and a test script.

### Task 1: Analyzer Node and Deterministic Reactive Signals

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/audio/AudioEngine.ts`
- Create: `src/audio/reactiveAnalysis.ts`
- Create: `src/audio/reactiveAnalysis.test.ts`

**Interfaces:**
- Produces: `AudioEngine.getFrequencyData(target: Uint8Array): boolean`
- Produces: `AudioEngine.frequencyBinCount: number`
- Produces: `ReactiveSnapshot`, `AudioReactiveAnalyzer.update(data: Uint8Array, nowMs: number): ReactiveSnapshot`
- Produces: `MoodEngine.update(snapshot: ReactiveSnapshot, dtMs: number): MoodSnapshot`

- [ ] **Step 1: Add Vitest and the test command**

Run: `npm install --save-dev vitest`

Add `"test": "vitest run"` to `scripts`.

- [ ] **Step 2: Write failing analyzer tests**

Create synthetic arrays and assert band separation, attack/release smoothing, beat cooldown, and stable mood weights:

```ts
import { describe, expect, it } from 'vitest';
import { AudioReactiveAnalyzer, MoodEngine } from './reactiveAnalysis';

it('emits one beat for a low-frequency impulse during cooldown', () => {
  const analyzer = new AudioReactiveAnalyzer(64);
  const quiet = new Uint8Array(64).fill(8);
  const kick = new Uint8Array(64).fill(8);
  kick.fill(245, 0, 8);
  analyzer.update(quiet, 0);
  const first = analyzer.update(kick, 100);
  const second = analyzer.update(kick, 180);
  expect(first.beat).toBe(1);
  expect(second.beat).toBe(0);
});

it('keeps mood weights normalized', () => {
  const mood = new MoodEngine();
  const result = mood.update({ bass: .8, mid: .7, treble: .7, energy: .85, beat: 1 }, 1000);
  expect(Object.values(result.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  expect(result.dominant).toBe('energetic');
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `npm test -- src/audio/reactiveAnalysis.test.ts`

Expected: FAIL because `reactiveAnalysis.ts` does not exist.

- [ ] **Step 4: Implement analyzer and mood engine**

Implement reusable snapshots, frequency-band averages, attack/release smoothing, a rolling bass baseline, a 240 ms beat cooldown, and normalized mood weights. Use a roughly 10-second exponential window and three-second mood interpolation; do not allocate arrays from `update()`.

- [ ] **Step 5: Insert and expose the Web Audio analyzer**

Create an analyzer with `fftSize = 256` and `smoothingTimeConstant = 0.72`. Connect `gainNode -> analyser -> destination`. `getFrequencyData()` returns `false` when unavailable and otherwise fills the caller-owned buffer.

- [ ] **Step 6: Verify tests and build**

Run: `npm test -- src/audio/reactiveAnalysis.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

- [ ] **Step 7: Commit the analyzer slice**

```bash
git add package.json package-lock.json src/audio/AudioEngine.ts src/audio/reactiveAnalysis.ts src/audio/reactiveAnalysis.test.ts
git commit -m "feat: add lightweight audio reactive analysis"
```

### Task 2: Cover Palette and Bounded Canvas Renderer

**Files:**
- Create: `src/visualizer/palette.ts`
- Create: `src/visualizer/palette.test.ts`
- Create: `src/visualizer/ParticleField.ts`

**Interfaces:**
- Consumes: `ReactiveSnapshot`, `MoodSnapshot`
- Produces: `extractCoverPalette(src: string): Promise<VisualPalette>`
- Produces: `fallbackPalette(seed: string): VisualPalette`
- Produces: `ParticleField.resize(width: number, height: number, dpr: number): void`
- Produces: `ParticleField.render(snapshot: ReactiveSnapshot, mood: MoodSnapshot, dtMs: number): void`
- Produces: `ParticleField.clear(): void` and `ParticleField.destroy(): void`

- [ ] **Step 1: Write failing palette tests**

```ts
import { describe, expect, it } from 'vitest';
import { fallbackPalette } from './palette';

it('returns a stable three-color palette for the same seed', () => {
  expect(fallbackPalette('track-42')).toEqual(fallbackPalette('track-42'));
  expect(fallbackPalette('track-42').colors).toHaveLength(3);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/visualizer/palette.test.ts`

Expected: FAIL because `palette.ts` does not exist.

- [ ] **Step 3: Implement palette extraction and fallback**

Downscale cover art to a 24×24 offscreen canvas, sample opaque pixels, divide them into three luminance/chroma buckets, and return CSS `rgb(r g b)` strings. Reject image loads after a timeout and return `fallbackPalette(seed)` at the call site. Keep the fallback deterministic.

- [ ] **Step 4: Implement the particle pool**

Preallocate 36 particles and a small fixed ring pool. Activate particles only on beats and treble peaks, update in place, clamp DPR to 1.5, and clear without reallocating. Rendering failures disable Canvas output without affecting CSS fog or audio.

- [ ] **Step 5: Verify focused tests and build**

Run: `npm test -- src/visualizer/palette.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 6: Commit the visual primitives**

```bash
git add src/visualizer/palette.ts src/visualizer/palette.test.ts src/visualizer/ParticleField.ts
git commit -m "feat: add liquid memory visual primitives"
```

### Task 3: Immersive View and Animation Lifecycle

**Files:**
- Create: `src/components/ImmersiveVisualizer.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `audioEngine`, `AudioReactiveAnalyzer`, `MoodEngine`, `ParticleField`, current track metadata, cover URL, playing state, current lyric, and motion setting.
- Produces: `ImmersiveVisualizer` component with `onExit()` and `onMotionChange(enabled: boolean)` callbacks.

- [ ] **Step 1: Build the static accessible structure**

Render the dissolved cover texture, three fog layers, Canvas, title, artist, current lyric, a visible motion toggle, and an exit button. Use a `<section aria-label="沉浸式音乐视觉">` and keep controls as native buttons.

- [ ] **Step 2: Implement palette transitions**

On cover/track change, extract a palette or use the deterministic fallback. Write the three colors to component-scoped CSS custom properties and cross-fade via CSS transitions; ignore stale async palette results after a later track change or unmount.

- [ ] **Step 3: Implement the capped animation loop**

Allocate the frequency buffer once. At no more than one update per 33 ms, read the analyzer, update signals/mood, write only CSS custom properties, and draw the particle field. Stop on pause, hidden document, disabled motion, or unmount. Ease properties toward rest before stopping after pause.

- [ ] **Step 4: Add responsive and reduced-motion CSS**

Keep the metadata readable from narrow windows upward. Under `prefers-reduced-motion: reduce`, stop fog transforms, pulses, rings, and Canvas display while retaining the static palette and metadata.

- [ ] **Step 5: Verify build**

Run: `npm run build`

Expected: build succeeds with no React hook or TypeScript errors.

- [ ] **Step 6: Commit the immersive component**

```bash
git add src/components/ImmersiveVisualizer.tsx src/styles/global.css
git commit -m "feat: add liquid memory immersive view"
```

### Task 4: App, Store, and Player-Bar Integration

**Files:**
- Modify: `src/store/useStore.ts`
- Modify: `src/components/PlayerBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: Zustand fields `immersiveMode: boolean`, `reactiveMotionEnabled: boolean`
- Produces: actions `setImmersiveMode(enabled: boolean)`, `setReactiveMotionEnabled(enabled: boolean)`
- Consumes: `ImmersiveVisualizer` from Task 3.

- [ ] **Step 1: Add durable UI switches to Zustand**

Initialize immersive mode to `false`. Initialize reactive motion from `matchMedia('(prefers-reduced-motion: reduce)').matches` when available, defaulting safely to enabled outside the browser.

- [ ] **Step 2: Add the player-bar immersive control and ambient targets**

Add an icon button beside lyrics/EQ, disable it when no current track exists, expose its active state, and provide a Chinese accessible title. Add component-scoped CSS variables for subtle play-button breathing and progress glow without changing layout.

- [ ] **Step 3: Mount the immersive view in App**

Replace only the `.app-main` contents when immersive mode is active; retain Sidebar, TitleBar, PlayerBar, drawers, and playback callbacks. Pass current track, cover art, playing state, current lyric, and motion state.

- [ ] **Step 4: Add exit behaviors**

Register an Escape handler only while immersive mode is active and remove it during cleanup. The player-bar button toggles the same state. Leaving immersive mode must not pause playback.

- [ ] **Step 5: Verify tests and production build**

Run: `npm test`

Expected: all analyzer and palette tests pass.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 6: Commit integration**

```bash
git add src/store/useStore.ts src/components/PlayerBar.tsx src/App.tsx src/styles/global.css
git commit -m "feat: integrate liquid memory playback mode"
```

### Task 5: Final Regression and Performance Verification

**Files:**
- Modify only files that fail verification.

**Interfaces:**
- Consumes the complete feature; produces a verified release candidate.

- [ ] **Step 1: Run automated verification from a clean process**

Run: `npm test && npm run build`

Expected: both commands exit 0.

- [ ] **Step 2: Run the Tauri app and exercise playback**

Run: `npm run tauri dev`

Verify a quiet track, a bass-heavy track, and a bright/energetic track; pause/resume, seek, next/previous, rapid track changes, missing cover, resize, background/foreground, Escape exit, motion toggle, EQ, lyrics, and continued playback while entering/exiting immersive mode.

- [ ] **Step 3: Inspect runtime behavior**

Confirm the animation holds near 30 updates per second, Canvas DPR is capped at 1.5, active particles never exceed 36, and sampling stops while hidden or paused. Confirm no repeated console errors and no analyzer allocations in the frame loop.

- [ ] **Step 4: Verify reduced motion**

Enable the OS/browser reduced-motion setting and confirm the palette remains visible while fog drift, pulse, particles, and pressure rings remain inactive.

- [ ] **Step 5: Run final diff checks**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the user's pre-existing unrelated changes remain.

- [ ] **Step 6: Commit verification fixes if required**

If verification required code changes, stage only the Liquid Memory files and commit them with:

```bash
git commit -m "fix: harden liquid memory visualizer"
```
