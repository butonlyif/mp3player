import { describe, expect, it, vi } from 'vitest';
import {
  createMagicPillController,
  type MagicPillPlatform,
} from './controller';
import type { MagicPillSnapshot } from './protocol';

const snapshot = (revision = 1): MagicPillSnapshot => ({
  version: 1,
  revision,
  trackId: null,
  title: '未播放',
  artist: '',
  palette: ['rgb(1 1 1)', 'rgb(2 2 2)', 'rgb(3 3 3)'],
  isPlaying: false,
});

function platformFake() {
  const calls: string[] = [];
  let commandHandler: (command: unknown) => void = () => undefined;
  let destroyedHandler: () => void = () => undefined;
  const commandUnlisten = vi.fn();
  const destroyedUnlisten = vi.fn();

  const platform: MagicPillPlatform = {
    createOrFocusPill: vi.fn(async () => { calls.push('create'); }),
    waitUntilReady: vi.fn(async () => { calls.push('ready'); }),
    sendSnapshot: vi.fn(async () => { calls.push('snapshot'); }),
    hideMain: vi.fn(async () => { calls.push('hide'); }),
    showAndFocusMain: vi.fn(async () => { calls.push('show-main'); }),
    closePill: vi.fn(async () => { calls.push('close-pill'); }),
    onCommand: vi.fn(async (handler) => {
      commandHandler = handler;
      return commandUnlisten;
    }),
    onPillDestroyed: vi.fn(async (handler) => {
      destroyedHandler = handler;
      return destroyedUnlisten;
    }),
  };

  return {
    calls,
    platform,
    emitCommand: (command: unknown) => commandHandler(command),
    destroyPill: () => destroyedHandler(),
    commandUnlisten,
    destroyedUnlisten,
  };
}

describe('Magic Pill lifecycle controller', () => {
  it('hides the main window only after readiness and the initial snapshot', async () => {
    const fake = platformFake();
    const controller = createMagicPillController(fake.platform);

    await controller.enter(snapshot());

    expect(fake.calls).toEqual(['create', 'ready', 'snapshot', 'hide']);
    expect(fake.platform.waitUntilReady).toHaveBeenCalledWith(4_000);
  });

  it('shares an in-flight entry and never creates duplicate pill windows', async () => {
    const fake = platformFake();
    let releaseReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    vi.mocked(fake.platform.waitUntilReady).mockReturnValue(ready);
    const controller = createMagicPillController(fake.platform);

    const first = controller.enter(snapshot());
    const second = controller.enter(snapshot());
    releaseReady();
    await Promise.all([first, second]);

    expect(fake.platform.createOrFocusPill).toHaveBeenCalledOnce();
  });

  it('closes a partial pill, cleans listeners, and leaves main visible after readiness fails', async () => {
    const fake = platformFake();
    vi.mocked(fake.platform.waitUntilReady).mockRejectedValue(new Error('ready timeout'));
    const controller = createMagicPillController(fake.platform);

    await expect(controller.enter(snapshot())).rejects.toThrow('ready timeout');

    expect(fake.platform.hideMain).not.toHaveBeenCalled();
    expect(fake.platform.closePill).toHaveBeenCalledOnce();
    expect(fake.commandUnlisten).toHaveBeenCalledOnce();
    expect(fake.destroyedUnlisten).toHaveBeenCalledOnce();
  });

  it('validates commands before forwarding them to the application handler', async () => {
    const fake = platformFake();
    const onCommand = vi.fn();
    const controller = createMagicPillController(fake.platform);
    controller.setCommandHandler(onCommand);
    await controller.enter(snapshot());

    fake.emitCommand({ type: 'seek', time: 10 });
    fake.emitCommand({ type: 'next' });

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith({ type: 'next' });
  });

  it('restores main when the pill is destroyed unexpectedly', async () => {
    const fake = platformFake();
    const controller = createMagicPillController(fake.platform);
    await controller.enter(snapshot());

    fake.destroyPill();
    await Promise.resolve();

    expect(fake.platform.showAndFocusMain).toHaveBeenCalledOnce();
  });

  it('shows and focuses main before intentionally closing the pill', async () => {
    const fake = platformFake();
    const controller = createMagicPillController(fake.platform);
    await controller.enter(snapshot());

    await controller.restore();

    expect(fake.calls.slice(-2)).toEqual(['show-main', 'close-pill']);
    expect(fake.commandUnlisten).toHaveBeenCalledOnce();
    expect(fake.destroyedUnlisten).toHaveBeenCalledOnce();
  });
});
