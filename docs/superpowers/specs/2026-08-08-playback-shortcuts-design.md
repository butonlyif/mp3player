# Playback Shortcuts Design

## Goal

Make core playback and visual controls accessible without a mouse while preventing shortcuts from interfering with text editing and dialogs.

## Key Map

- `Space`: play or pause.
- `ArrowLeft` / `ArrowRight`: seek backward or forward 5 seconds.
- `Shift+ArrowLeft` / `Shift+ArrowRight`: previous or next track.
- `ArrowUp` / `ArrowDown`: volume up or down by 5 percentage points.
- `I`: enter or exit immersive mode.
- `L`: open or close lyrics.
- `E`: open or close EQ.
- `M`: mute or restore the last non-zero volume.
- `Escape`: exit immersive mode first, otherwise close the active drawer or modal.

## Behavior

Use one application-level keyboard handler with a declarative key map. Do not respond to playback shortcuts when the event target is an input, textarea, select, contenteditable region, or interactive dialog field. `Escape` remains available for dismissing the current surface.

Prevent browser/default behavior only when the application actually handles the shortcut. Ignore repeated keydown events for toggles and track navigation; allow controlled repeat for seeking and volume changes.

Button titles include shortcut hints. Muting remembers the last non-zero volume for the current app session. Shortcut state does not require persistence.

## Testing

Test every mapping, editable-target suppression, repeat handling, bounds for seek/volume, mute restoration, Escape priority, no-track behavior, and event-listener cleanup.

## Scope Boundaries

Shortcuts are not user-configurable in this version. System media keys and lock-screen metadata remain a separate enhancement.
