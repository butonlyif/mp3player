import { describe, expect, it } from 'vitest';
import { firstPillPosition, pillPositionForState } from './geometry';

const workArea = { x: 0, y: 24, width: 1440, height: 876 };

describe('Magic Pill window geometry', () => {
  it('places first use near the usable top-right corner', () => {
    expect(firstPillPosition(workArea)).toEqual({ x: 1332, y: 44 });
  });

  it('expands left while preserving the collapsed right edge', () => {
    expect(pillPositionForState({ x: 1332, y: 44 }, workArea, true)).toEqual({ x: 1094, y: 44 });
  });

  it('clamps a restored anchor into the usable monitor area', () => {
    expect(pillPositionForState({ x: -80, y: 940 }, workArea, false)).toEqual({ x: 0, y: 812 });
  });
});
