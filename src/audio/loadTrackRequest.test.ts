import { describe, expect, it, vi } from 'vitest';

import { loadTrackRequest } from './loadTrackRequest';

describe('loadTrackRequest', () => {
  it('does not revive a stale track after a cancelled crossfade', async () => {
    let currentTrackId = 1;
    let finishCrossfade!: (value: boolean) => void;
    const crossfadeResult = new Promise<boolean>((resolve) => {
      finishCrossfade = resolve;
    });
    const engine = {
      crossfadeTo: vi.fn(() => crossfadeResult),
      cancelCrossfade: vi.fn(),
      load: vi.fn(),
      play: vi.fn(),
    };

    const request = loadTrackRequest({
      trackId: 1,
      urlPromise: Promise.resolve('track-1'),
      fadeSeconds: 0.5,
      crossfadeEnabled: true,
      engine,
      isCurrent: (trackId) => currentTrackId === trackId,
      shouldPlay: () => true,
    });

    await vi.waitFor(() => expect(engine.crossfadeTo).toHaveBeenCalledOnce());
    currentTrackId = 2;
    finishCrossfade(false);
    await request;

    expect(engine.load).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('distinguishes an obsolete request when the same track is selected again', async () => {
    const controller = new AbortController();
    let finishCrossfade!: (value: boolean) => void;
    const engine = {
      crossfadeTo: vi.fn(() => new Promise<boolean>((resolve) => { finishCrossfade = resolve; })),
      cancelCrossfade: vi.fn(),
      load: vi.fn(),
      play: vi.fn(),
    };

    const request = loadTrackRequest({
      trackId: 1,
      urlPromise: Promise.resolve('old-track-1-request'),
      fadeSeconds: 0.5,
      crossfadeEnabled: true,
      engine,
      signal: controller.signal,
      // The user went 1 → 2 → 1, so an ID-only check is insufficient.
      isCurrent: () => true,
      shouldPlay: () => true,
    });

    await vi.waitFor(() => expect(engine.crossfadeTo).toHaveBeenCalledOnce());
    controller.abort();
    finishCrossfade(false);
    await request;

    expect(engine.load).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.cancelCrossfade).toHaveBeenCalledOnce();
  });
});
