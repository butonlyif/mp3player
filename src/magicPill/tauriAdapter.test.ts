import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTauriMagicPillPlatform,
  loadSavedPillPosition,
  savePillPosition,
  type PillWindowLike,
  type TauriMagicPillDependencies,
} from './tauriAdapter';
import { MAGIC_PILL_READY, MAGIC_PILL_SNAPSHOT, type MagicPillSnapshot } from './protocol';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set('lumen.magic-pill.position', initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function adapterFake() {
  const pill: PillWindowLike = {
    show: vi.fn(async () => undefined),
    setFocus: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    setPosition: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined),
    listen: vi.fn(async () => vi.fn()),
    onMoved: vi.fn(async () => vi.fn()),
    scaleFactor: vi.fn(async () => 2),
    innerSize: vi.fn(async () => ({ width: 176, height: 176 })),
  };
  const mainListeners = new Map<string, (event: { payload: unknown }) => void>();
  const readyUnlisten = vi.fn();
  const dependencies: TauriMagicPillDependencies = {
    storage: memoryStorage(),
    getExistingPill: vi.fn(async () => null),
    createPill: vi.fn(() => pill),
    getWorkArea: vi.fn(async () => ({ x: 0, y: 24, width: 1440, height: 876 })),
    mainWindow: {
      hide: vi.fn(async () => undefined),
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
      listen: vi.fn(async (event, handler) => {
        mainListeners.set(event, handler);
        return event === MAGIC_PILL_READY ? readyUnlisten : vi.fn();
      }),
    },
    emitTo: vi.fn(async () => undefined),
  };
  return { dependencies, mainListeners, pill, readyUnlisten };
}

const snapshot: MagicPillSnapshot = {
  version: 1,
  revision: 1,
  trackId: 9,
  title: '风景与你',
  artist: 'Peter',
  palette: ['rgb(220 120 80)', 'rgb(90 50 120)', 'rgb(24 20 35)'],
  isPlaying: true,
};

describe('Magic Pill position persistence', () => {
  it('round-trips a finite point', () => {
    const storage = memoryStorage();
    savePillPosition(storage, { x: 120, y: 80 });
    expect(loadSavedPillPosition(storage)).toEqual({ x: 120, y: 80 });
  });

  it('rejects malformed and non-finite points', () => {
    expect(loadSavedPillPosition(memoryStorage('{"x":"bad","y":5}'))).toBeNull();
    expect(loadSavedPillPosition(memoryStorage('{"x":1,"y":null}'))).toBeNull();
    expect(loadSavedPillPosition(memoryStorage('not-json'))).toBeNull();
  });
});

describe('Tauri Magic Pill adapter', () => {
  beforeEach(() => vi.useRealTimers());

  it('creates a transparent always-on-top pill at the restored safe position', async () => {
    const fake = adapterFake();
    fake.dependencies.storage = memoryStorage('{"x":1332,"y":44}');
    const platform = createTauriMagicPillPlatform(fake.dependencies);

    await platform.createOrFocusPill();

    expect(fake.dependencies.createPill).toHaveBeenCalledWith('magic-pill', expect.objectContaining({
      x: 1332,
      y: 44,
      width: 88,
      height: 88,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      shadow: false,
    }));
  });

  it('reuses and focuses an existing pill', async () => {
    const fake = adapterFake();
    vi.mocked(fake.dependencies.getExistingPill).mockResolvedValue(fake.pill);
    const platform = createTauriMagicPillPlatform(fake.dependencies);

    await platform.createOrFocusPill();

    expect(fake.dependencies.createPill).not.toHaveBeenCalled();
    expect(fake.pill.show).toHaveBeenCalledOnce();
    expect(fake.pill.setFocus).toHaveBeenCalledOnce();
  });

  it('cleans the readiness listener after success', async () => {
    const fake = adapterFake();
    const platform = createTauriMagicPillPlatform(fake.dependencies);
    const waiting = platform.waitUntilReady(4_000);
    fake.mainListeners.get(MAGIC_PILL_READY)?.({ payload: { label: 'magic-pill' } });

    await expect(waiting).resolves.toBeUndefined();
    expect(fake.readyUnlisten).toHaveBeenCalledOnce();
  });

  it('rejects on readiness timeout and still cleans the listener', async () => {
    vi.useFakeTimers();
    const fake = adapterFake();
    const platform = createTauriMagicPillPlatform(fake.dependencies);
    const waiting = platform.waitUntilReady(4_000);
    const rejection = expect(waiting).rejects.toThrow('Magic Pill ready timeout');

    await vi.advanceTimersByTimeAsync(4_000);

    await rejection;
    expect(fake.readyUnlisten).toHaveBeenCalledOnce();
  });

  it('targets complete snapshots to the pill window', async () => {
    const fake = adapterFake();
    const platform = createTauriMagicPillPlatform(fake.dependencies);

    await platform.sendSnapshot(snapshot);

    expect(fake.dependencies.emitTo).toHaveBeenCalledWith(
      'magic-pill',
      MAGIC_PILL_SNAPSHOT,
      snapshot,
    );
  });
});
