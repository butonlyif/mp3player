import { describe, expect, it } from 'vitest';
import { tuneMagicPillPalette } from './palette';

describe('tuneMagicPillPalette', () => {
  it('lifts dark colors into visible ranges without changing their hue family', () => {
    expect(tuneMagicPillPalette({
      colors: ['rgb(64 0 0)', 'rgb(0 64 0)', 'rgb(0 0 64)'],
    })).toEqual({
      colors: ['rgb(236 60 60)', 'rgb(13 130 13)', 'rgb(13 13 130)'],
    });
  });

  it('limits pale colors so the glow retains contrast', () => {
    expect(tuneMagicPillPalette({
      colors: ['rgb(255 255 255)', 'rgb(255 240 240)', 'rgb(240 240 255)'],
    })).toEqual({
      colors: ['rgb(184 184 184)', 'rgb(236 60 60)', 'rgb(60 60 236)'],
    });
  });

  it('is deterministic and does not mutate the extracted palette', () => {
    const source = {
      colors: ['rgb(244 240 232)', 'rgb(224 90 72)', 'rgb(28 42 62)'],
    } as const;

    const first = tuneMagicPillPalette(source);

    expect(tuneMagicPillPalette(source)).toEqual(first);
    expect(source.colors).toEqual(['rgb(244 240 232)', 'rgb(224 90 72)', 'rgb(28 42 62)']);
  });
});
