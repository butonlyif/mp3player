// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MagicPillController } from './controller';
import type { MagicPillCommand } from './protocol';
import { useMagicPillBridge } from './useMagicPillBridge';

function controllerFake() {
  let commandHandler: (command: MagicPillCommand) => void = () => undefined;
  const controller: MagicPillController = {
    setCommandHandler: vi.fn((handler) => { commandHandler = handler; }),
    enter: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    restore: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
  return { controller, command: (value: MagicPillCommand) => commandHandler(value) };
}

const baseInput = {
  trackId: 9,
  title: '风景与你',
  artist: 'Peter',
  isPlaying: true,
  palette: ['rgb(220 120 80)', 'rgb(90 50 120)', 'rgb(24 20 35)'] as [string, string, string],
};

afterEach(cleanup);

describe('useMagicPillBridge', () => {
  it('enters with a complete revision-one snapshot', async () => {
    const fake = controllerFake();
    const actions = { previous: vi.fn(), togglePlayback: vi.fn(), next: vi.fn() };
    const { result } = renderHook(() => useMagicPillBridge({
      controller: fake.controller,
      ...baseInput,
      actions,
    }));

    await act(() => result.current.enterMagicPill());

    expect(fake.controller.enter).toHaveBeenCalledWith({
      version: 1,
      revision: 1,
      trackId: 9,
      title: '风景与你',
      artist: 'Peter',
      isPlaying: true,
      palette: baseInput.palette,
    });
  });

  it('publishes a new complete revision only when snapshot fields change', async () => {
    const fake = controllerFake();
    const actions = { previous: vi.fn(), togglePlayback: vi.fn(), next: vi.fn() };
    const { rerender } = renderHook(
      ({ title }) => useMagicPillBridge({ controller: fake.controller, ...baseInput, title, actions }),
      { initialProps: { title: '风景与你' } },
    );
    await act(async () => { await Promise.resolve(); });
    vi.mocked(fake.controller.publish).mockClear();

    rerender({ title: '第二首歌' });
    await act(async () => { await Promise.resolve(); });

    expect(fake.controller.publish).toHaveBeenCalledOnce();
    expect(fake.controller.publish).toHaveBeenCalledWith(expect.objectContaining({
      revision: 2,
      title: '第二首歌',
      trackId: 9,
      isPlaying: true,
    }));
  });

  it('maps commands to the latest playback actions and controller restore', async () => {
    const fake = controllerFake();
    const firstNext = vi.fn();
    const latestNext = vi.fn();
    const { rerender } = renderHook(
      ({ next }) => useMagicPillBridge({
        controller: fake.controller,
        ...baseInput,
        actions: { previous: vi.fn(), togglePlayback: vi.fn(), next },
      }),
      { initialProps: { next: firstNext } },
    );
    rerender({ next: latestNext });

    act(() => {
      fake.command({ type: 'next' });
      fake.command({ type: 'restore-main' });
    });

    expect(firstNext).not.toHaveBeenCalled();
    expect(latestNext).toHaveBeenCalledOnce();
    expect(fake.controller.restore).toHaveBeenCalledOnce();
  });

  it('disposes controller listeners when the main root unmounts', () => {
    const fake = controllerFake();
    const { unmount } = renderHook(() => useMagicPillBridge({
      controller: fake.controller,
      ...baseInput,
      actions: { previous: vi.fn(), togglePlayback: vi.fn(), next: vi.fn() },
    }));

    unmount();

    expect(fake.controller.dispose).toHaveBeenCalledOnce();
  });
});
