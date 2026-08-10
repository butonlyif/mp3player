import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { emitTo } from '@tauri-apps/api/event';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { classifyPillGesture } from './gesture';
import { pillPositionForState, type Point } from './geometry';
import {
  acceptSnapshot,
  MAGIC_PILL_COMMAND,
  MAGIC_PILL_READY,
  MAGIC_PILL_SNAPSHOT,
  type MagicPillCommand,
  type MagicPillSnapshot,
} from './protocol';
import './MagicPillWindow.css';

export interface MagicPillViewPlatform {
  onSnapshot(handler: (snapshot: unknown) => void): Promise<() => void>;
  onBlur(handler: () => void): Promise<() => void>;
  emitReady(): Promise<void>;
  emitCommand(command: MagicPillCommand): Promise<void>;
  resize(expanded: boolean): Promise<void>;
  startDragging(): Promise<void>;
}

const dormantSnapshot: MagicPillSnapshot = {
  version: 1,
  revision: -1,
  trackId: null,
  title: '未播放',
  artist: '',
  palette: ['rgb(138 138 148)', 'rgb(72 72 82)', 'rgb(26 27 32)'],
  isPlaying: false,
};

function createTauriPillViewPlatform(): MagicPillViewPlatform {
  const pillWindow = getCurrentWindow();
  let collapsedAnchor: Point | null = null;

  return {
    onSnapshot: (handler) => pillWindow.listen(MAGIC_PILL_SNAPSHOT, (event) => handler(event.payload)),
    onBlur: (handler) => pillWindow.onFocusChanged(({ payload }) => { if (!payload) handler(); }),
    emitReady: () => emitTo('main', MAGIC_PILL_READY, { label: 'magic-pill' }),
    emitCommand: (command) => emitTo('main', MAGIC_PILL_COMMAND, command),
    async resize(expanded) {
      const [position, scale, monitor] = await Promise.all([
        pillWindow.outerPosition(),
        pillWindow.scaleFactor(),
        currentMonitor(),
      ]);
      if (!monitor) throw new Error('No monitor available for Magic Pill resize');
      const logicalPosition = position.toLogical(scale);
      if (expanded) collapsedAnchor = logicalPosition;
      else if (!collapsedAnchor) {
        collapsedAnchor = { x: logicalPosition.x + 238, y: logicalPosition.y };
      }
      const areaPosition = monitor.workArea.position.toLogical(monitor.scaleFactor);
      const areaSize = monitor.workArea.size.toLogical(monitor.scaleFactor);
      const target = pillPositionForState(collapsedAnchor, {
        x: areaPosition.x,
        y: areaPosition.y,
        width: areaSize.width,
        height: areaSize.height,
      }, expanded);
      await pillWindow.setPosition(new LogicalPosition(target.x, target.y));
      await pillWindow.setSize(new LogicalSize(expanded ? 326 : 88, expanded ? 82 : 88));
    },
    startDragging: () => pillWindow.startDragging(),
  };
}

interface MagicPillWindowProps {
  platform?: MagicPillViewPlatform;
}

export default function MagicPillWindow({ platform: providedPlatform }: MagicPillWindowProps) {
  const platformRef = useRef<MagicPillViewPlatform | null>(null);
  if (!platformRef.current) platformRef.current = providedPlatform ?? createTauriPillViewPlatform();
  const platform = platformRef.current;
  const [snapshot, setSnapshot] = useState(dormantSnapshot);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const pointerStart = useRef<Point | null>(null);
  const dragged = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreLocked = useRef(false);

  const setExpandedState = (next: boolean) => {
    expandedRef.current = next;
    setExpanded(next);
    void platform.resize(next);
  };

  useEffect(() => {
    let disposed = false;
    let unlistenSnapshot: (() => void) | undefined;
    let unlistenBlur: (() => void) | undefined;
    void (async () => {
      unlistenSnapshot = await platform.onSnapshot((candidate) => {
        if (disposed) return;
        setSnapshot((current) => acceptSnapshot(current.revision, candidate) ?? current);
      });
      unlistenBlur = await platform.onBlur(() => {
        if (!disposed && expandedRef.current) setExpandedState(false);
      });
      if (!disposed) await platform.emitReady();
    })();
    return () => {
      disposed = true;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      unlistenSnapshot?.();
      unlistenBlur?.();
    };
  }, [platform]);

  const restoreMain = () => {
    if (restoreLocked.current) return;
    restoreLocked.current = true;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    void platform.emitCommand({ type: 'restore-main' });
    setTimeout(() => { restoreLocked.current = false; }, 0);
  };

  const handleSurfaceClick = (detail: number) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (detail >= 2) {
      restoreMain();
      return;
    }
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setExpandedState(!expandedRef.current);
    }, 220);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current || dragged.current || (event.buttons & 1) === 0) return;
    if (classifyPillGesture(pointerStart.current, { x: event.clientX, y: event.clientY }) === 'drag') {
      dragged.current = true;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      void platform.startDragging();
    }
  };

  const style = {
    '--pill-bright': snapshot.palette[0],
    '--pill-body': snapshot.palette[1],
    '--pill-shadow': snapshot.palette[2],
  } as CSSProperties;

  const emitControl = (command: MagicPillCommand) => (event: React.MouseEvent) => {
    event.stopPropagation();
    void platform.emitCommand(command);
  };

  return (
    <div
      className="magic-pill"
      data-expanded={expanded}
      data-playing={snapshot.isPlaying}
      data-testid="magic-pill-surface"
      style={style}
      onClick={(event) => handleSurfaceClick(event.detail)}
      onDoubleClick={(event) => { event.preventDefault(); restoreMain(); }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => { pointerStart.current = null; }}
    >
      <button
        type="button"
        className="magic-pill__core"
        aria-label={expanded ? '收起魔丸' : '展开魔丸'}
      />
      {expanded && (
        <>
          <div className="magic-pill__metadata">
            <span className="magic-pill__title">{snapshot.title}</span>
            <span className="magic-pill__artist">{snapshot.artist}</span>
          </div>
          <div className="magic-pill__controls">
            <button type="button" aria-label="上一首" onClick={emitControl({ type: 'previous' })}>◀</button>
            <button
              type="button"
              className="magic-pill__play"
              aria-label={snapshot.isPlaying ? '暂停' : '播放'}
              onClick={emitControl({ type: 'toggle-playback' })}
            >
              {snapshot.isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <button type="button" aria-label="下一首" onClick={emitControl({ type: 'next' })}>▶</button>
          </div>
        </>
      )}
    </div>
  );
}
