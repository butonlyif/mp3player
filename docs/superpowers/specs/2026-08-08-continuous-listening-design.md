# Continuous Listening Design

## Goal

Create a continuous, cinematic listening experience using adaptive crossfade, gentle real-time loudness balancing, and section-aware visual intensity. All processing remains local and lightweight.

## User Experience

- Automatic transitions use a C-lite adaptive crossfade between 1 and 4 seconds.
- Quiet tails use shorter transitions; ordinary tails use about 2.5 seconds; sustained loud or reverberant tails may use up to 4 seconds.
- Manual next/previous actions use a 0.5-second transition.
- If adaptive analysis or preloading is unavailable, transition behavior falls back to a fixed 2.5-second crossfade or an immediate safe switch.
- Loudness slowly calibrates over a 10–15 second window and never makes abrupt gain changes.
- Visual sections are never labeled in the interface. Intro, steady, peak, and outro states only shape intensity.
- Peak sections may be 55%–70% more visually intense than quiet sections, but changes cross-fade over 2–4 seconds and never flash the whole screen.

## Audio Architecture

Replace the single media element with two reusable decks. Each deck owns:

`HTMLAudioElement -> MediaElementSource -> 10-band EQ -> DeckGain -> DeckAnalyser`

Both decks feed a shared output chain:

`Deck A + Deck B -> LoudnessGain -> DynamicsCompressor -> MasterGain -> destination`

Only one deck is primary outside a transition. The other deck is idle or preloading the next URL. EQ values are mirrored to both decks. User volume remains the final master control and is independent from crossfade/loudness automation.

## Crossfade Controller

The controller has explicit `idle`, `preloading`, `ready`, and `crossfading` states. It knows the active deck, standby deck, next track identity, and transition token.

- Preload the next sequential or shuffled queue item before the current track ends.
- Estimate tail strength from a rolling eight-second energy window.
- Map stable tail strength to a duration from 1–4 seconds.
- Schedule equal-power gain curves so the middle of a transition does not sound quieter.
- Promote the standby deck atomically after the transition; stop and reset the old deck.
- A newer seek, pause, or navigation command invalidates the previous transition token.
- Repeat-one performs a short self fade rather than loading another track.

## Loudness Controller

Use a slow RMS-like energy estimate from the active deck. Adjust `LoudnessGain` toward a conservative target over 10–15 seconds.

- Start every track at 0 dB compensation.
- Limit positive and negative compensation to a safe narrow range.
- Freeze or slowly release compensation during quiet intros instead of amplifying silence.
- Use `DynamicsCompressorNode` only for peak protection, with gentle settings.
- During crossfade, derive control data from both decks without allowing a sudden compensation step.
- If analysis is unavailable, remain at 0 dB and preserve normal playback.

## Section Detector

Aggregate recent energy, beat density, brightness, and their trends. Emit:

- Internal state: `intro | steady | peak | outro`.
- Continuous `intensity` in the range 0–1.
- Confidence used only to slow uncertain transitions.

A peak requires several seconds of sustained energy growth; individual beats do not change sections. Outro requires both remaining-time context and sustained decline. The visualizer consumes only smoothed intensity and never stores it in React/Zustand high-frequency state.

Intensity controls fog travel, fog scale, particle spawn rate, pressure-ring strength, and lyric luminance. Reduced-motion mode keeps a static palette regardless of section.

## Failure Handling

- Standby preload failure: finish the current track and perform a safe immediate switch.
- Analysis unavailable: fixed 2.5-second transition, 0 dB loudness compensation, steady visual intensity.
- Crossfade scheduling error: cancel automation, select one deck, and preserve playback.
- Rapid repeated navigation: only the latest transition token may update store state.
- Pause/seek during crossfade: cancel both gain curves, choose the intended deck, and synchronize current time.

## Testing

Test the deck state machine, active/standby promotion, equal-power curves, 1–4 second duration boundaries, manual 0.5-second transitions, preload failure, stale transition tokens, rapid navigation, pause/seek cancellation, repeat-one behavior, loudness gain limits, quiet-intro protection, unavailable-analysis fallbacks, section hysteresis, and smoothed visual intensity.

Manual verification must cover gapless local playback, different codecs, very short tracks, tracks with silence at either end, EQ during crossfade, volume changes during crossfade, and background/foreground transitions.

## Scope Boundaries

No offline LUFS scan, ReplayGain tag writing, beat-grid alignment, DJ-style tempo matching, cloud analysis, or ML music classification is included.
