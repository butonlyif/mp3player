export const MEANINGFUL_PLAY_SECONDS = 30;
export const RESUME_MIN_DURATION_SECONDS = 10 * 60;
export const PROGRESS_WRITE_INTERVAL_MS = 15_000;
const RESUME_EDGE_SECONDS = 10;
const PROGRESS_DELTA_SECONDS = 20;

export function isMeaningfulPlay(listenedSeconds: number): boolean {
  return listenedSeconds >= MEANINGFUL_PLAY_SECONDS;
}

export function resumePosition(duration: number, position: number): number | null {
  if (duration < RESUME_MIN_DURATION_SECONDS) return null;
  if (position < RESUME_EDGE_SECONDS || position >= duration - RESUME_EDGE_SECONDS) return null;
  return position;
}

export function shouldPersistProgress(
  position: number,
  previousPosition: number,
  nowMs: number,
  previousWriteMs: number,
): boolean {
  return nowMs - previousWriteMs >= PROGRESS_WRITE_INTERVAL_MS
    || Math.abs(position - previousPosition) >= PROGRESS_DELTA_SECONDS;
}
