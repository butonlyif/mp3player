import { describe, expect, it } from 'vitest';
import { classifyPillGesture } from './gesture';

describe('classifyPillGesture', () => {
  it('keeps small pointer jitter as a click', () => {
    expect(classifyPillGesture({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe('click');
  });

  it('classifies movement beyond four pixels as a drag', () => {
    expect(classifyPillGesture({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe('drag');
    expect(classifyPillGesture({ x: 10, y: 10 }, { x: 10, y: 5 })).toBe('drag');
  });
});
