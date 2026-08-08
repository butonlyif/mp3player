import { describe, expect, it } from 'vitest';
import { ParticlePool } from './ParticleField';

describe('ParticlePool', () => {
  it('never activates more than the configured particle limit', () => {
    const pool = new ParticlePool(36, () => 0.5);
    for (let index = 0; index < 20; index += 1) pool.update(0.9, 1, 34, 800, 500);
    expect(pool.activeCount).toBeLessThanOrEqual(36);
  });

  it('lets particles settle without spawning when the signal is quiet', () => {
    const pool = new ParticlePool(8, () => 0.5);
    pool.update(1, 1, 34, 800, 500);
    expect(pool.activeCount).toBeGreaterThan(0);

    for (let index = 0; index < 200; index += 1) pool.update(0, 0, 34, 800, 500);
    expect(pool.activeCount).toBe(0);
  });

  it('creates a visible fast meteor from moderate treble', () => {
    const pool = new ParticlePool(8, () => 0.5);
    pool.update(0.42, 0, 250, 800, 500);

    let speed = 0;
    pool.forEachActive((particle) => { speed = Math.hypot(particle.vx, particle.vy); });
    expect(pool.activeCount).toBeGreaterThan(0);
    expect(speed).toBeGreaterThan(80);
  });
});
