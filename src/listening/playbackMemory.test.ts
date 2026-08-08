import { describe, expect, it } from 'vitest';
import {
  isMeaningfulPlay,
  resumePosition,
  shouldPersistProgress,
} from './playbackMemory';

describe('playback memory policy', () => {
  it('counts a play only after thirty listened seconds', () => {
    expect(isMeaningfulPlay(29.9)).toBe(false);
    expect(isMeaningfulPlay(30)).toBe(true);
  });

  it('only resumes long audio away from the beginning and end', () => {
    expect(resumePosition(599, 180)).toBeNull();
    expect(resumePosition(600, 180)).toBe(180);
    expect(resumePosition(1200, 3)).toBeNull();
    expect(resumePosition(1200, 1192)).toBeNull();
  });

  it('throttles progress writes while retaining meaningful changes', () => {
    expect(shouldPersistProgress(20, 12, 5_000, 0)).toBe(false);
    expect(shouldPersistProgress(20, 12, 15_000, 0)).toBe(true);
    expect(shouldPersistProgress(35, 12, 5_000, 0)).toBe(true);
  });
});
