import { describe, expect, it } from 'vitest';
import { contextSelectionIds, idsIntersectingRect, type RowRect } from './selectionModel';

describe('idsIntersectingRect', () => {
  it('selects every row touched by a marquee rectangle', () => {
    const rows: RowRect[] = [
      { id: 1, left: 0, top: 0, right: 100, bottom: 20 },
      { id: 2, left: 0, top: 30, right: 100, bottom: 50 },
      { id: 3, left: 0, top: 60, right: 100, bottom: 80 },
      { id: 4, left: 0, top: 90, right: 100, bottom: 110 },
    ];

    expect(idsIntersectingRect(
      { left: 10, top: 25, right: 90, bottom: 75 },
      rows,
    )).toEqual([2, 3]);
  });

  it('normalizes a rectangle dragged up and to the left', () => {
    expect(idsIntersectingRect(
      { left: 90, top: 75, right: 10, bottom: 25 },
      [{ id: 8, left: 0, top: 30, right: 100, bottom: 50 }],
    )).toEqual([8]);
  });
});

describe('contextSelectionIds', () => {
  it('uses the full selection only when the context-clicked row is selected', () => {
    expect(contextSelectionIds(2, new Set([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(contextSelectionIds(9, new Set([1, 2, 3]))).toEqual([9]);
  });
});
