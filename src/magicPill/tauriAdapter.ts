import { emitTo, TauriEvent } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import type { MagicPillPlatform } from './controller';
import { COLLAPSED_SIZE, firstPillPosition, pillPositionForState, type Point, type Rect } from './geometry';
import {
  MAGIC_PILL_COMMAND,
  MAGIC_PILL_READY,
  MAGIC_PILL_SNAPSHOT,
  type MagicPillSnapshot,
} from './protocol';

const POSITION_KEY = 'lumen.magic-pill.position';

export interface PositionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PillWindowOptions {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  decorations: boolean;
  transparent: boolean;
  alwaysOnTop: boolean;
  resizable: boolean;
  skipTaskbar: boolean;
  shadow: boolean;
  visible: boolean;
}

interface WindowEvent<T> {
  payload: T;
}

export interface PillWindowLike {
  show(): Promise<void>;
  setFocus(): Promise<void>;
  close(): Promise<void>;
  listen(event: string, handler: (event: WindowEvent<unknown>) => void): Promise<() => void>;
  onMoved(handler: (event: WindowEvent<{ x: number; y: number }>) => void): Promise<() => void>;
  scaleFactor(): Promise<number>;
  innerSize(): Promise<{ width: number; height: number }>;
}

interface MainWindowLike {
  hide(): Promise<void>;
  show(): Promise<void>;
  setFocus(): Promise<void>;
  listen(event: string, handler: (event: WindowEvent<unknown>) => void): Promise<() => void>;
}

export interface TauriMagicPillDependencies {
  storage: PositionStorage;
  getExistingPill(): Promise<PillWindowLike | null>;
  createPill(label: string, options: PillWindowOptions): PillWindowLike;
  getWorkArea(): Promise<Rect>;
  mainWindow: MainWindowLike;
  emitTo(target: string, event: string, payload?: unknown): Promise<void>;
}

export function loadSavedPillPosition(storage: Pick<PositionStorage, 'getItem'>): Point | null {
  const saved = storage.getItem(POSITION_KEY);
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Partial<Point>;
    return typeof value.x === 'number' && Number.isFinite(value.x)
      && typeof value.y === 'number' && Number.isFinite(value.y)
      ? { x: value.x, y: value.y }
      : null;
  } catch {
    return null;
  }
}

export function savePillPosition(storage: Pick<PositionStorage, 'setItem'>, point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  storage.setItem(POSITION_KEY, JSON.stringify(point));
}

async function defaultWorkArea(): Promise<Rect> {
  const monitor = await currentMonitor() ?? await primaryMonitor();
  if (!monitor) throw new Error('No monitor available for Magic Pill');
  const position = monitor.workArea.position.toLogical(monitor.scaleFactor);
  const size = monitor.workArea.size.toLogical(monitor.scaleFactor);
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

function defaultDependencies(): TauriMagicPillDependencies {
  const mainWindow = getCurrentWindow();
  return {
    storage: window.localStorage,
    getExistingPill: () => WebviewWindow.getByLabel('magic-pill'),
    createPill: (label, options) => new WebviewWindow(label, options),
    getWorkArea: defaultWorkArea,
    mainWindow,
    emitTo,
  };
}

export function createTauriMagicPillPlatform(
  dependencies: TauriMagicPillDependencies = defaultDependencies(),
): MagicPillPlatform {
  let pill: PillWindowLike | null = null;
  let trackedPill: PillWindowLike | null = null;
  let readyPromise: Promise<void> | null = null;
  let resolveReady: (() => void) | null = null;
  let readyUnlisten: Promise<() => void> | null = null;

  const prepareReadyListener = () => {
    if (readyPromise) return;
    readyPromise = new Promise<void>((resolve) => { resolveReady = resolve; });
    readyUnlisten = dependencies.mainWindow.listen(MAGIC_PILL_READY, (event) => {
      const payload = event.payload as { label?: unknown } | null;
      if (payload?.label === 'magic-pill') resolveReady?.();
    });
  };

  const findPill = async () => pill ?? await dependencies.getExistingPill();

  const trackCollapsedPosition = async (target: PillWindowLike) => {
    if (trackedPill === target) return;
    trackedPill = target;
    await target.onMoved(({ payload }) => {
      void Promise.all([target.scaleFactor(), target.innerSize()]).then(([scale, size]) => {
        if (size.width / scale <= COLLAPSED_SIZE.width + 1) {
          savePillPosition(dependencies.storage, { x: payload.x / scale, y: payload.y / scale });
        }
      });
    });
  };

  return {
    async createOrFocusPill() {
      const existing = await dependencies.getExistingPill();
      if (existing) {
        pill = existing;
        readyPromise = Promise.resolve();
        await trackCollapsedPosition(existing);
        await existing.show();
        await existing.setFocus();
        return;
      }

      prepareReadyListener();
      const area = await dependencies.getWorkArea();
      const saved = loadSavedPillPosition(dependencies.storage);
      const position = saved
        ? pillPositionForState(saved, area, false)
        : firstPillPosition(area);
      pill = dependencies.createPill('magic-pill', {
        title: 'Soul Play Magic Pill',
        x: position.x,
        y: position.y,
        width: COLLAPSED_SIZE.width,
        height: COLLAPSED_SIZE.height,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        shadow: false,
        visible: true,
      });
      await trackCollapsedPosition(pill);
    },

    async waitUntilReady(timeoutMs) {
      prepareReadyListener();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          readyPromise,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Magic Pill ready timeout')), timeoutMs);
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        const unlisten = await readyUnlisten;
        unlisten?.();
        readyPromise = null;
        resolveReady = null;
        readyUnlisten = null;
      }
    },

    sendSnapshot(snapshot: MagicPillSnapshot) {
      return dependencies.emitTo('magic-pill', MAGIC_PILL_SNAPSHOT, snapshot);
    },

    hideMain() {
      return dependencies.mainWindow.hide();
    },

    async showAndFocusMain() {
      await dependencies.mainWindow.show();
      await dependencies.mainWindow.setFocus();
    },

    async closePill() {
      const target = await findPill();
      await target?.close();
      pill = null;
      trackedPill = null;
    },

    onCommand(handler) {
      return dependencies.mainWindow.listen(MAGIC_PILL_COMMAND, (event) => handler(event.payload));
    },

    async onPillDestroyed(handler) {
      const target = await findPill();
      if (!target) return () => undefined;
      return target.listen(TauriEvent.WINDOW_DESTROYED, handler);
    },
  };
}
