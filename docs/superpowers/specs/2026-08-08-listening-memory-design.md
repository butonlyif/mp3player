# Listening Memory Design

## Goal

Remember meaningful listening activity so users can return to long audio, revisit recent tracks, and discover their most-played music without cloud accounts or telemetry.

## Stored Data

Add one SQLite table keyed by track ID with:

- `play_count`: completed meaningful play sessions.
- `last_played_at`: Unix timestamp of the most recent meaningful session.
- `resume_position`: last saved playback position for long audio.
- `updated_at`: timestamp for maintenance/debugging.

Deleting a library track cascades or explicitly removes its listening-memory row.

## Meaningful Play Rules

- A session becomes meaningful after 30 seconds of accumulated playback.
- Seeking does not count as listening time.
- Paused time does not count.
- Rapid next/previous actions before 30 seconds do not update play count or recent history.
- Each track session increments play count at most once.
- Update `last_played_at` when the session becomes meaningful.

## Resume Rules

- Only tracks with duration greater than 10 minutes receive automatic resume behavior.
- Save position periodically at a low frequency and on pause, track change, and app shutdown where available.
- Do not save positions near the beginning or final portion of a track.
- When reopening a long track with a valid saved position, seek before starting playback.
- Ordinary songs always start at zero.
- Users can clear one track's saved resume position.

## Library Experience

Add two sidebar destinations:

- `最近聆听`: tracks ordered by `last_played_at` descending.
- `常听歌曲`: tracks ordered by `play_count` descending, with recent activity as a tie-breaker.

Both reuse the existing library row layout and playback behavior. Empty states explain how entries are created. Listening statistics remain local.

## API and Data Flow

Rust/SQLite owns persistence and exposes commands to record meaningful sessions, save/clear resume positions, fetch recent tracks, and fetch frequently played tracks. React owns only the current session timer and invokes coarse-grained commands; it does not write on every audio time update.

## Failure Handling

- Database migration failure must not prevent basic playback; log the problem and hide/disable memory views for the session.
- A missing/deleted track is omitted from memory queries.
- Resume seek failure starts the track from zero.
- Failed memory writes are non-fatal and never interrupt audio.

## Testing

Test migration idempotency, deletion cleanup, 30-second threshold, pause and seek exclusion, one increment per session, >10-minute resume eligibility, near-start/end filtering, save throttling, recent/frequent ordering, missing-track handling, and non-fatal persistence failures.

## Scope Boundaries

No cloud sync, account profile, recommendation model, listening streaks, social sharing, or detailed analytics dashboard is included.
