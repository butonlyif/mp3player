export const COLLAPSED_SIZE = { width: 88, height: 88 } as const;
export const EXPANDED_SIZE = { width: 326, height: 82 } as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const MARGIN = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function firstPillPosition(area: Rect): Point {
  return {
    x: area.x + area.width - COLLAPSED_SIZE.width - MARGIN,
    y: area.y + MARGIN,
  };
}

export function pillPositionForState(
  collapsedAnchor: Point,
  area: Rect,
  expanded: boolean,
): Point {
  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
  const leftwardGrowth = expanded ? EXPANDED_SIZE.width - COLLAPSED_SIZE.width : 0;
  return {
    x: clamp(
      collapsedAnchor.x - leftwardGrowth,
      area.x,
      area.x + area.width - size.width,
    ),
    y: clamp(collapsedAnchor.y, area.y, area.y + area.height - size.height),
  };
}
