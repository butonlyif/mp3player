# Liquid Memory Audio-Reactive Visualizer Design

## Goal

Add a lightweight audio-reactive experience to Peter Player. Playback gets subtle motion in the normal interface and an optional immersive "Liquid Memory" mode. The effect reacts to rhythm and locally inferred mood without network services, machine-learning models, WebGL, or third-party visualization libraries.

## Product Decisions

- Normal mode keeps the existing layout and small player-bar cover.
- Immersive mode fills the main content region while keeping playback controls accessible.
- The song cover is not shown as a prominent card. It is enlarged, blurred, desaturated as needed, and dissolved into the background texture.
- The song title is the visual center. Artist and current lyric are secondary.
- Motion defaults to a balanced intensity: calm between beats, visibly stronger during choruses and energetic passages.
- Users can enter or leave immersive mode and disable reactive motion.
- The implementation respects `prefers-reduced-motion`.

## Technical Approach

Use the existing Web Audio graph and add one `AnalyserNode` after the master gain node. A small analyzer derives a limited set of normalized signals. CSS renders the large blurred color fields and Canvas 2D renders a bounded particle layer. React controls lifecycle and layout only; per-frame audio values never enter the Zustand store or React state.

The audio graph becomes:

`media source -> 10 EQ filters -> master gain -> analyser -> destination`

This placement makes the visual response reflect the user's EQ and volume settings. Analysis output is visual-only and never feeds back into the audio graph.

## Components

### AudioEngine extension

`AudioEngine` owns the `AnalyserNode` because it already owns the `AudioContext` and audio graph. It exposes a stable method for filling caller-owned time/frequency buffers and reports whether analysis is available. The analyzer uses a modest FFT size and reuses typed arrays to avoid per-frame allocation.

### AudioReactiveAnalyzer

A framework-independent module samples frequency data and emits one reusable snapshot containing:

- `bass`: low-frequency energy used for pressure waves and gentle scale changes.
- `mid`: mid-frequency energy used for fog movement.
- `treble`: high-frequency energy used for small highlights.
- `energy`: smoothed whole-spectrum loudness.
- `beat`: a short impulse when low-frequency energy exceeds an adaptive recent baseline.

Signals use attack/release smoothing. Beat detection uses a rolling energy baseline and cooldown rather than BPM estimation. This is intentionally perceptual and lightweight, not a music-analysis tool.

### MoodEngine

`MoodEngine` evaluates an approximately 10-second rolling window and assigns blended weights to four visual moods:

- `calm`: low energy and low beat density; blue-violet, slow drift, few particles.
- `warm`: moderate energy with a balanced spectrum; amber and rose, soft diffusion.
- `melancholic`: subdued energy with low spectral brightness; deep blue and desaturated violet, gentle downward drift.
- `energetic`: high energy, high beat density, or high brightness; magenta and cyan, faster drift and more particles.

Mood changes cross-fade over about three seconds. The engine does not claim semantic understanding of lyrics or musical intent; it produces a stable visual classification from acoustic cues.

### ImmersiveVisualizer

The visualizer is layered behind a small foreground metadata group:

1. A cover-derived blurred texture with low opacity.
2. Three CSS gradient fog layers whose transforms and opacity are updated through CSS custom properties.
3. One transparent Canvas 2D layer containing at most 36 reusable particles and short-lived pressure rings.
4. Song title, artist, and current lyric.

The cover palette is extracted once per track by drawing a downscaled cover to a tiny offscreen canvas and sampling representative pixels. If extraction fails, the cover is unavailable, or canvas access is restricted, a stable theme palette is used. Track changes cross-fade the old and new palettes.

### Ambient player-bar response

Normal mode reuses the same analyzer but limits effects to subtle CSS variables on the player bar: low-amplitude play-button breathing, a soft progress highlight, and a faint cover-colored haze. No particle canvas is mounted in normal mode.

## State and Data Flow

React/Zustand continues to own durable UI state such as current track, playback state, and whether immersive mode is enabled. High-frequency visual data stays outside the store:

1. `AudioEngine` fills reusable analysis buffers.
2. A single `requestAnimationFrame` loop samples them at a capped rate.
3. `AudioReactiveAnalyzer` smooths the samples.
4. `MoodEngine` updates slowly from aggregated samples.
5. The renderer writes CSS custom properties and draws the Canvas layer directly.

The loop is capped near 30 FPS. It stops when playback is paused, the document is hidden, no track is loaded, motion is disabled, or the component unmounts. Pausing eases the current visual state to rest over roughly 800 ms before sampling stops.

## Interaction

- Add an immersive-mode button to the player bar near lyrics and EQ controls.
- Entering immersive mode replaces the library/playlist content region; the title bar and player bar remain usable.
- Escape and the immersive-mode button both leave immersive mode.
- A motion toggle is available from the immersive view. Disabling it retains the cover-derived static background.
- With reduced motion enabled, the immersive view is static by default: no particles, pressure rings, pulsing, or drifting transforms.

## Performance Constraints

- No WebGL and no new runtime visualization dependency.
- Target about 30 visual updates per second rather than display refresh rate.
- Reuse frequency buffers, analyzer snapshots, particle objects, and Canvas paths where practical.
- Keep the particle pool at or below 36.
- Use a device-pixel-ratio ceiling for the Canvas rather than rendering unbounded high-DPI pixels.
- Stop all sampling and drawing when the window is hidden.
- Avoid React renders in the animation loop.

## Failure Handling

- If `AudioContext` or `AnalyserNode` initialization fails, playback remains functional and the visualizer shows a static cover-derived or theme-derived background.
- If cover palette extraction fails, use the theme fallback without surfacing an error to the user.
- If Canvas creation fails, CSS fog remains available.
- Analyzer failures are isolated from playback and logged once rather than once per frame.
- Resizing recreates Canvas dimensions without recreating audio nodes.

## Testing

Unit tests cover signal normalization, smoothing, beat cooldown, mood thresholds, mood-transition stability, palette fallback, and reduced-motion decisions. Tests use synthetic frequency arrays and do not require real audio playback.

Component tests cover immersive-mode entry/exit, Escape handling, absence of the Canvas particle layer under reduced motion, and preservation of playback controls.

Manual verification covers:

- quiet acoustic, bass-heavy, bright, and energetic tracks;
- pause, resume, seek, next/previous track, and rapid track changes;
- missing and malformed cover art;
- window resize, backgrounding, and returning to the app;
- reduced-motion mode and motion toggle;
- confirming EQ and playback behavior remain unchanged.

## Scope Boundaries

This feature does not perform offline pre-analysis, BPM/key detection, lyric sentiment analysis, persistent per-track mood metadata, audio export, or shader-based fluid simulation. Those can be considered separately only if the lightweight real-time design proves insufficient.
