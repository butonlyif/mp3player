// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const playback = vi.hoisted(() => ({
  getResume: vi.fn(),
  record: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: { playback } }));
import { usePlaybackMemory } from './usePlaybackMemory';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('usePlaybackMemory', () => {
  it('restores an eligible long track after its duration is available', async () => {
    playback.getResume.mockResolvedValue(180);
    const seek = vi.fn(() => true);
    renderHook(() => usePlaybackMemory({ trackId: 7, isPlaying: false, currentTime: 0, duration: 1200, seek }));

    await waitFor(() => expect(seek).toHaveBeenCalledWith(180));
  });

  it('records a meaningful play once after thirty listened seconds', () => {
    playback.getResume.mockResolvedValue(null);
    playback.record.mockResolvedValue(undefined);
    const seek = vi.fn(() => true);
    const { rerender } = renderHook(
      ({ time }) => usePlaybackMemory({ trackId: 9, isPlaying: true, currentTime: time, duration: 240, seek }),
      { initialProps: { time: 0 } },
    );

    for (let time = 1; time <= 31; time += 1) {
      act(() => rerender({ time }));
    }

    expect(playback.record.mock.calls.filter((call) => call[2] === true)).toHaveLength(1);
  });
});
