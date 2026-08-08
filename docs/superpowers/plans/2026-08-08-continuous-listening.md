# Continuous Listening Implementation Plan

**Goal:** Add optional adaptive Crossfade, gentle real-time loudness balancing, and strongly contrasted section-aware visual intensity without adding a third-party audio engine.

**Architecture:** Extend the existing Web Audio graph with a dynamics compressor and a slowly adjusted normalization gain. Crossfade uses one temporary secondary `HTMLAudioElement` connected to the same graph; only the overlap window has two sources. A pure section-intensity estimator combines normalized song position with live energy and feeds the existing visualizer signal.

**Tech Stack:** Web Audio API, React, Zustand, Canvas, Vitest.

---

### Task 1: Preferences and pure transition policy

Create tested pure helpers for adaptive 1–4 second fade duration, manual 0.5 second transitions, setting persistence, and section intensity. Add `crossfadeEnabled` and `loudnessBalanceEnabled` to the store; Crossfade defaults on and can be switched off.

### Task 2: Lightweight dual-source Crossfade

Extend `AudioEngine` with a temporary secondary media element/source. Ramp element gains during overlap, promote the new deck after completion, and retain all playback callbacks. Trigger the transition before natural track end and use 0.5 seconds for manual next/previous. Fall back to the existing immediate load path whenever disabled or preparation fails.

### Task 3: Loudness balancing

Add a compressor and normalization gain before the analyser. Estimate average energy over the first 10–15 seconds and adjust gain slowly within conservative bounds so dynamics remain audible. Make this independently toggleable.

### Task 4: Section-aware visual contrast and controls

Blend intro/steady/peak/outro position curves with live energy. Increase peak visual output by roughly 55–70% while keeping transitions eased. Add compact Crossfade and loudness switches to the existing EQ/settings drawer.

### Task 5: Verification

Run focused and full tests, build, diff check, independent review, then commit only continuous-listening files. Note that native Rust runtime verification remains unavailable if Cargo is absent.
