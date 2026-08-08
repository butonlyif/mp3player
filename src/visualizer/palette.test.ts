import { describe, expect, it } from 'vitest';
import { fallbackPalette, paletteFromPixels } from './palette';

describe('fallbackPalette', () => {
  it('returns the same three valid colors for the same track seed', () => {
    const first = fallbackPalette('track-42');
    const second = fallbackPalette('track-42');

    expect(first).toEqual(second);
    expect(first.colors).toHaveLength(3);
    for (const color of first.colors) expect(color).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });
});

describe('paletteFromPixels', () => {
  it('ignores transparent pixels and preserves distinct cover colors', () => {
    const pixels = new Uint8ClampedArray([
      255, 20, 40, 255,
      20, 210, 180, 255,
      70, 40, 220, 255,
      255, 255, 255, 0,
    ]);

    const palette = paletteFromPixels(pixels);

    expect(new Set(palette.colors).size).toBe(3);
    expect(palette.colors).toContain('rgb(255 20 40)');
  });

  it('uses a fallback when the image has no visible pixels', () => {
    const palette = paletteFromPixels(new Uint8ClampedArray(16), 'empty-cover');
    expect(palette).toEqual(fallbackPalette('empty-cover'));
  });
});
