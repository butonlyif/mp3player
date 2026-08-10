import { describe, expect, it, vi } from 'vitest';

describe('AudioEngine crossfade when window is hidden', () => {
  it('completes the transition immediately instead of stalling on rAF', async () => {
    const docStub = {
      hidden: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const winStub = { setTimeout: setTimeout, clearTimeout: clearTimeout };
    vi.stubGlobal('document', docStub);
    vi.stubGlobal('window', winStub);
    vi.stubGlobal('Audio', class {
      crossOrigin = '';
      volume = 0;
      src = '';
      duration = 200;
      addEventListener(ev: string, cb: () => void) {
        if (ev === 'canplay') setTimeout(cb, 0);
      }
      load() {}
      async play() {}
      pause() {}
      removeAttribute() {}
    });
    const { AudioEngine } = await import('./AudioEngine');
    const engine = Object.create(AudioEngine.prototype) as InstanceType<typeof AudioEngine>;
    const previous = { volume: 0.5, paused: false, pause: vi.fn(), removeAttribute: vi.fn() };
    Object.assign(engine as unknown as Record<string, unknown>, {
      audio: previous,
      source: { connect() {}, disconnect() {} },
      ctx: {
        currentTime: 0,
        createMediaElementSource: () => ({ connect() {}, disconnect() {} }),
      },
      filters: [{ connect() {} }],
      crossfading: false,
      crossfadeGeneration: 0,
      transitionAudio: null,
      bindAudioEvents() {},
      ensureContext() {},
      _loadedCb: null,
      _playStateCb: null,
      loudnessSamples: 0,
      loudnessMean: 0,
      loudnessCalibrationElapsed: 0,
      lastCalibrationPosition: 0,
      normalizationGain: { gain: { setValueAtTime() {} } },
    });

    const result = await engine.crossfadeTo('http://example.com/next.mp3', 0.5);

    expect(result).toBe(true);
    expect(previous.volume).toBe(0);
    expect(previous.pause).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

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
