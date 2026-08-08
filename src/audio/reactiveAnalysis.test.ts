import { describe, expect, it } from 'vitest';
import {
  AudioReactiveAnalyzer,
  MoodEngine,
  frequencyBandBins,
  type ReactiveSnapshot,
} from './reactiveAnalysis';

function spectrum(
  bins: number,
  ranges: Array<[start: number, end: number, value: number]>,
): Uint8Array {
  const data = new Uint8Array(bins);
  for (const [start, end, value] of ranges) data.fill(value, start, end);
  return data;
}

describe('AudioReactiveAnalyzer', () => {
  it('maps bass to real frequencies below 250 Hz', () => {
    expect(frequencyBandBins(128, 44_100, 256)).toEqual({ bassEnd: 2, midEnd: 24, trebleEnd: 70 });
  });

  it('separates bass, mid, and treble energy', () => {
    const analyzer = new AudioReactiveAnalyzer(64, 16_000, 128);
    const result = analyzer.update(
      spectrum(64, [[0, 8, 255], [8, 32, 128], [32, 64, 32]]),
      0,
    );

    expect(result.bass).toBeGreaterThan(result.mid);
    expect(result.mid).toBeGreaterThan(result.treble);
    expect(result.energy).toBeGreaterThan(0);
  });

  it('releases energy gradually after an impulse', () => {
    const analyzer = new AudioReactiveAnalyzer(64);
    const loud = analyzer.update(new Uint8Array(64).fill(255), 0).energy;
    const released = analyzer.update(new Uint8Array(64), 34).energy;

    expect(released).toBeGreaterThan(0);
    expect(released).toBeLessThan(loud);
  });

  it('emits only one beat during the cooldown window', () => {
    const analyzer = new AudioReactiveAnalyzer(64);
    const quiet = new Uint8Array(64).fill(8);
    const kick = spectrum(64, [[0, 8, 245]]);

    analyzer.update(quiet, 0);
    analyzer.update(quiet, 80);
    const firstBeat = analyzer.update(kick, 400).beat;
    const secondBeat = analyzer.update(kick, 500).beat;

    expect(firstBeat).toBe(1);
    expect(secondBeat).toBe(0);
  });
});

describe('MoodEngine', () => {
  it('keeps weights normalized and recognizes energetic sound', () => {
    const engine = new MoodEngine();
    const energetic: ReactiveSnapshot = {
      bass: 0.9,
      mid: 0.75,
      treble: 0.72,
      energy: 0.84,
      beat: 1,
    };

    let result = engine.update(energetic, 1000);
    for (let i = 0; i < 12; i += 1) result = engine.update(energetic, 1000);

    expect(Object.values(result.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(result.dominant).toBe('energetic');
  });

  it('changes mood through a blend instead of jumping instantly', () => {
    const engine = new MoodEngine();
    const calm: ReactiveSnapshot = { bass: 0.08, mid: 0.08, treble: 0.04, energy: 0.07, beat: 0 };
    const energetic: ReactiveSnapshot = { bass: 0.95, mid: 0.8, treble: 0.8, energy: 0.9, beat: 1 };

    for (let i = 0; i < 12; i += 1) engine.update(calm, 1000);
    const before = engine.update(calm, 1000).weights.energetic;
    const afterOneFrame = engine.update(energetic, 34).weights.energetic;

    expect(afterOneFrame).toBeGreaterThan(before);
    expect(afterOneFrame).toBeLessThan(0.5);
  });
});
