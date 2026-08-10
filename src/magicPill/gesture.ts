import type { Point } from './geometry';

export type PillGesture = 'click' | 'drag';

const DRAG_THRESHOLD = 4;

export function classifyPillGesture(start: Point, current: Point): PillGesture {
  return Math.hypot(current.x - start.x, current.y - start.y) > DRAG_THRESHOLD
    ? 'drag'
    : 'click';
}
