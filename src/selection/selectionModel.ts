export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RowRect extends Rect {
  id: number;
}

const normalizeRect = (rect: Rect): Rect => ({
  left: Math.min(rect.left, rect.right),
  top: Math.min(rect.top, rect.bottom),
  right: Math.max(rect.left, rect.right),
  bottom: Math.max(rect.top, rect.bottom),
});

export const intersectsRect = (a: Rect, b: Rect): boolean => {
  const first = normalizeRect(a);
  const second = normalizeRect(b);
  return first.left <= second.right
    && first.right >= second.left
    && first.top <= second.bottom
    && first.bottom >= second.top;
};

export const idsIntersectingRect = (selection: Rect, rows: RowRect[]): number[] =>
  rows.filter((row) => intersectsRect(selection, row)).map((row) => row.id);

export const contextSelectionIds = (clickedId: number, selectedIds: Set<number>): number[] =>
  selectedIds.has(clickedId) ? [...selectedIds] : [clickedId];
