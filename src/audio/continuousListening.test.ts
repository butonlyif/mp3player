import { describe, expect, it } from 'vitest';
import { adaptiveCrossfadeSeconds, sectionIntensity } from './continuousListening';

describe('continuous listening policy', () => {
  it('uses shorter overlap for energetic tails and stays within one to four seconds', () => {
    expect(adaptiveCrossfadeSeconds(0)).toBe(4);
    expect(adaptiveCrossfadeSeconds(1)).toBe(1);
    expect(adaptiveCrossfadeSeconds(0.5)).toBe(2.5);
  });

  it('creates a strong but bounded peak contrast with eased edges', () => {
    const intro = sectionIntensity(0.03, 0.5);
    const steady = sectionIntensity(0.35, 0.5);
    const peak = sectionIntensity(0.68, 0.5);
    const outro = sectionIntensity(0.97, 0.5);

    expect(peak / steady).toBeGreaterThanOrEqual(1.55);
    expect(intro).toBeLessThan(steady);
    expect(outro).toBeLessThan(steady);
    expect(peak).toBeLessThanOrEqual(1.7);
  });
});
