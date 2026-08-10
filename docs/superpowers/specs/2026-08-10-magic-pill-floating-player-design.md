# Magic Pill Floating Player Design

**Date:** 2026-08-10  
**Status:** Approved for implementation planning

## Goal

Add a true desktop-level mini-player to Soul Play. Entering Magic Pill mode hides the main window and leaves a small, independent, always-on-top player that can be dragged anywhere on the desktop. The main window remains alive and continues to own playback.

## User Experience

### Entering and leaving

- Add a Magic Pill mode action to the main window title bar.
- Activating it creates the `magic-pill` window. The main window hides only after the new window reports that it is ready.
- Double-clicking the pill shows and focuses the main window, then closes the pill window.
- If pill creation fails, the main window stays visible.
- If the pill window closes unexpectedly, the main window is restored.

### Collapsed state

- The default state is a circular 88 × 88 logical-pixel window.
- Only the animated cover-colored core is visible.
- A single click expands the pill.
- The full pill surface can be used to drag the window. Click-versus-drag handling must prevent a drag from toggling the expanded state.
- Playback produces a restrained breathing animation. Paused or stopped playback leaves the core still.

### Expanded state

- The expanded window is 326 × 82 logical pixels with a capsule shape.
- It shows the animated core, song title, artist, previous, play/pause, and next controls.
- It does not show playback progress, volume, lyrics, or secondary actions.
- Song and artist text truncate to one line rather than increasing the window size.
- Clicking the core again or letting the window lose focus collapses it.
- Expansion must keep the complete capsule within the current monitor's usable bounds. When necessary, the window grows toward the left rather than off-screen.

### Desktop behavior

- The pill is transparent, frameless, resizable only under application control, and always on top.
- The last collapsed-window position is saved locally and restored on the next use.
- On first use, place it near the top-right of the active monitor's usable area with a small margin.
- Multi-monitor edge cases beyond keeping the current pill visible are outside the first release.

## Visual Design

The pill uses the approved **Core Magic Pill** direction: a dark glass-like shell surrounding a luminous circular core. It should read as a living desktop object, not a conventional miniature app window.

### Cover-derived color

- Reuse the existing `extractCoverPalette` and three-color `VisualPalette` pipeline.
- Apply an additional presentation transform that preserves the extracted hues while correcting saturation, lightness, and contrast for reliable glow and legibility.
- Use the corrected colors for the bright center, body color, outer shadow, and supporting gradient.
- Animate palette changes over approximately 500 ms when the track changes.
- If cover extraction is unavailable, use the existing deterministic `fallbackPalette` seeded by track identity.
- The dark outer shell stays neutral so pale or highly saturated covers remain readable.

### Motion and accessibility

- Playback breathing is subtle and does not rapidly flash.
- Respect `prefers-reduced-motion`: disable breathing and replace palette transitions with an immediate or short non-spatial fade.
- Controls have accessible names and keyboard focus treatment even though pointer use is primary.

## Architecture

### Ownership

The main window remains the single source of truth for playback. It continues to own:

- `AudioEngine`
- the playback queue and navigation actions
- the Zustand application store
- cover-art loading and palette extraction

The pill is a projection and command surface. It does not instantiate another audio engine or duplicate queue logic.

### Window lifecycle

Introduce a small main-window controller responsible for:

1. creating or focusing the `magic-pill` Tauri webview window;
2. waiting for the pill-ready event before hiding `main`;
3. sending the initial snapshot;
4. restoring `main` when requested or when the pill exits unexpectedly; and
5. cleaning up listeners when Magic Pill mode ends.

The Tauri capability configuration must explicitly permit both `main` and `magic-pill` to use only the window and event operations they require.

### State bridge

Define a versioned, serializable pill snapshot containing:

- track identity;
- title and artist;
- corrected three-color palette;
- `isPlaying`; and
- a monotonically increasing revision number.

The main window sends a complete snapshot when the pill becomes ready and whenever one of these fields changes. Complete snapshots avoid partial-update ordering bugs. The pill ignores snapshots older than its current revision.

The pill emits one of four typed commands:

- `previous`
- `toggle-playback`
- `next`
- `restore-main`

The main window validates the command and invokes the existing playback action. Commands are idempotent where possible; rapid duplicate navigation commands are handled by the existing playback-loading safeguards.

### Frontend routing

The existing frontend bundle serves both windows. At startup it checks the current Tauri window label:

- `main` renders the existing application shell;
- `magic-pill` renders a dedicated `MagicPillWindow` root.

This keeps a single build pipeline while ensuring the pill does not mount the main application's playback effects.

## Failure Handling

- **Creation failure:** keep `main` visible and surface a non-blocking error.
- **Ready timeout:** close the incomplete pill, keep or restore `main`, and remove temporary listeners.
- **Initial snapshot delay:** render a neutral dormant core until a valid snapshot arrives.
- **Cover extraction failure:** render the deterministic fallback palette; playback controls remain available.
- **Event bridge interruption or pill crash:** restore the main window when the pill window is destroyed.
- **Invalid or stale event:** ignore it without changing playback.
- **Restore failure:** do not close the pill until the main window has successfully been shown and focused.

## Testing

### Unit tests

- Palette presentation correction and deterministic fallback behavior.
- Snapshot serialization, revision ordering, and invalid-event rejection.
- Pill command mapping to existing playback actions.
- Click, double-click, and drag gesture arbitration.
- Expanded-position calculation at screen edges.

### Component tests

- Collapsed and expanded rendering.
- Song and artist truncation.
- Play/pause icon updates.
- Neutral loading state and missing-cover fallback.
- Reduced-motion behavior and accessible control names.

### Window workflow tests

- The main window hides only after pill readiness.
- Creation failure and ready timeout leave the main window available.
- An unexpected pill close restores the main window.
- Double-click restores and focuses the main window before closing the pill.
- Entering the mode repeatedly does not create duplicate pill windows or listeners.

### Manual desktop acceptance

- Dragging feels smooth and does not accidentally expand the pill.
- The window remains above ordinary windows.
- Transparent corners do not show an opaque rectangular background.
- Palette changes are smooth when tracks change.
- Expansion remains on-screen near monitor edges.
- Position restores correctly after exiting and re-entering the mode.

## Scope Boundaries

The first release intentionally excludes progress, seeking, volume, lyrics, right-click menus, edge snapping, independent pill playback, and advanced multi-monitor placement rules. These can be added later without changing the state-bridge boundary.

## Acceptance Criteria

The feature is complete when a user can enter Magic Pill mode from the main window, continue uninterrupted playback through an independent always-on-top colored core, single-click to access the approved controls, drag it around the desktop, and double-click to return reliably to the main application. All automated tests described above pass, and the manual desktop acceptance checks succeed on the development platform.
