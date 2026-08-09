import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { idsIntersectingRect, type Rect, type RowRect } from './selectionModel';

interface MarqueeSelectionOptions {
  containerRef: RefObject<HTMLElement | null>;
  selectedIds: Set<number>;
  setSelection: (ids: Iterable<number>, anchorId?: number | null) => void;
  clearSelection: () => void;
}

export function useMarqueeSelection({
  containerRef, selectedIds, setSelection, clearSelection,
}: MarqueeSelectionOptions) {
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseIds: Set<number>; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection]);

  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-selection-ignore]')) return;
    const baseIds = event.metaKey || event.ctrlKey ? new Set(selectedIds) : new Set<number>();
    dragRef.current = { startX: event.clientX, startY: event.clientY, baseIds, moved: false };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      if (Math.hypot(moveEvent.clientX - drag.startX, moveEvent.clientY - drag.startY) < 4) return;
      drag.moved = true;
      const next = { left: drag.startX, top: drag.startY, right: moveEvent.clientX, bottom: moveEvent.clientY };
      setMarquee(next);
      const rows: RowRect[] = [...container.querySelectorAll<HTMLElement>('[data-track-id]')].map((row) => {
        const rect = row.getBoundingClientRect();
        return { id: Number(row.dataset.trackId), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      setSelection(new Set([...drag.baseIds, ...idsIntersectingRect(next, rows)]));
    };

    const onMouseUp = () => {
      if (dragRef.current?.moved) suppressClickRef.current = true;
      dragRef.current = null;
      setMarquee(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [containerRef, selectedIds, setSelection]);

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  const marqueeStyle = marquee ? {
    left: Math.min(marquee.left, marquee.right),
    top: Math.min(marquee.top, marquee.bottom),
    width: Math.abs(marquee.right - marquee.left),
    height: Math.abs(marquee.bottom - marquee.top),
  } : undefined;

  return { marquee, marqueeStyle, onMouseDown, consumeSuppressedClick };
}
