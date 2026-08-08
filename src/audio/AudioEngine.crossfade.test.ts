import { describe, expect, it, vi } from 'vitest';

describe('AudioEngine crossfade cancellation', () => {
  it('immediately pauses the temporary audio and restores the primary audio', async () => {
    vi.stubGlobal('Audio', class {
      crossOrigin = '';
      addEventListener() {}
    });
    const { AudioEngine } = await import('./AudioEngine');
    const primaryAudio = { volume: 0.25 };
    const transitionAudio = { pause: vi.fn() };
    const engine = Object.create(AudioEngine.prototype) as InstanceType<typeof AudioEngine>;
    Object.assign(engine as unknown as Record<string, unknown>, {
      audio: primaryAudio,
      transitionAudio,
      crossfading: true,
      crossfadeGeneration: 4,
    });

    engine.cancelCrossfade();

    expect(transitionAudio.pause).toHaveBeenCalledOnce();
    expect(primaryAudio.volume).toBe(1);
    expect(engine as unknown as Record<string, unknown>).toMatchObject({
      transitionAudio: null,
      crossfading: false,
      crossfadeGeneration: 5,
    });
  });

  it('does not let an obsolete crossfade clear a newer transition', async () => {
    vi.stubGlobal('Audio', class {
      crossOrigin = '';
      addEventListener() {}
    });
    const { AudioEngine } = await import('./AudioEngine');
    const engine = Object.create(AudioEngine.prototype) as InstanceType<typeof AudioEngine>;
    const oldTransition = {};
    const newTransition = {};
    Object.assign(engine as unknown as Record<string, unknown>, {
      transitionAudio: newTransition,
      crossfading: true,
      crossfadeGeneration: 8,
    });

    const released = (engine as unknown as {
      releaseCrossfade(generation: number, audio: object): boolean;
    }).releaseCrossfade(7, oldTransition);

    expect(released).toBe(false);
    expect(engine as unknown as Record<string, unknown>).toMatchObject({
      transitionAudio: newTransition,
      crossfading: true,
      crossfadeGeneration: 8,
    });
  });
});
