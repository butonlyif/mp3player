// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MagicPillWindow, { type MagicPillViewPlatform } from './MagicPillWindow';
import type { MagicPillSnapshot } from './protocol';

const snapshot = (overrides: Partial<MagicPillSnapshot> = {}): MagicPillSnapshot => ({
  version: 1,
  revision: 1,
  trackId: 9,
  title: '乌兰巴托的夜',
  artist: '声音碎片',
  palette: ['rgb(220 120 80)', 'rgb(90 50 120)', 'rgb(24 20 35)'],
  isPlaying: true,
  ...overrides,
});

function platformFake() {
  let snapshotHandler: (value: unknown) => void = () => undefined;
  let blurHandler: () => void = () => undefined;
  const platform: MagicPillViewPlatform = {
    onSnapshot: vi.fn(async (handler) => {
      snapshotHandler = handler;
      return vi.fn();
    }),
    onBlur: vi.fn(async (handler) => {
      blurHandler = handler;
      return vi.fn();
    }),
    emitReady: vi.fn(async () => undefined),
    emitCommand: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    startDragging: vi.fn(async () => undefined),
  };
  return {
    platform,
    pushSnapshot: (value: unknown) => snapshotHandler(value),
    blur: () => blurHandler(),
  };
}

async function flushEffects() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MagicPillWindow', () => {
  it('subscribes before announcing readiness and starts in a dormant collapsed state', async () => {
    const fake = platformFake();
    render(<MagicPillWindow platform={fake.platform} />);
    await flushEffects();

    expect(fake.platform.onSnapshot).toHaveBeenCalledOnce();
    expect(fake.platform.emitReady).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '展开魔丸' })).toBeInTheDocument();
    expect(screen.getByTestId('magic-pill-surface')).toHaveAttribute('data-playing', 'false');
  });

  it('renders only the approved information and controls after a single click', async () => {
    const fake = platformFake();
    render(<MagicPillWindow platform={fake.platform} />);
    await flushEffects();
    act(() => fake.pushSnapshot(snapshot()));

    fireEvent.click(screen.getByRole('button', { name: '展开魔丸' }), { detail: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });

    expect(screen.getByText('乌兰巴托的夜')).toBeInTheDocument();
    expect(screen.getByText('声音碎片')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一首' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一首' })).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(fake.platform.resize).toHaveBeenCalledWith(true);
  });

  it('emits typed playback commands without collapsing the expanded pill', async () => {
    const fake = platformFake();
    render(<MagicPillWindow platform={fake.platform} />);
    await flushEffects();
    act(() => fake.pushSnapshot(snapshot()));
    fireEvent.click(screen.getByRole('button', { name: '展开魔丸' }), { detail: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });

    fireEvent.click(screen.getByRole('button', { name: '上一首' }));
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    fireEvent.click(screen.getByRole('button', { name: '下一首' }));

    expect(fake.platform.emitCommand).toHaveBeenNthCalledWith(1, { type: 'previous' });
    expect(fake.platform.emitCommand).toHaveBeenNthCalledWith(2, { type: 'toggle-playback' });
    expect(fake.platform.emitCommand).toHaveBeenNthCalledWith(3, { type: 'next' });
    expect(screen.getByText('乌兰巴托的夜')).toBeInTheDocument();
  });

  it('emits restore-main once on double click and cancels the pending single click', async () => {
    const fake = platformFake();
    render(<MagicPillWindow platform={fake.platform} />);
    await flushEffects();
    const surface = screen.getByTestId('magic-pill-surface');

    fireEvent.click(surface, { detail: 1 });
    fireEvent.doubleClick(surface, { detail: 2 });
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(fake.platform.emitCommand).toHaveBeenCalledOnce();
    expect(fake.platform.emitCommand).toHaveBeenCalledWith({ type: 'restore-main' });
    expect(fake.platform.resize).not.toHaveBeenCalled();
  });

  it('ignores stale and malformed snapshots', async () => {
    const fake = platformFake();
    render(<MagicPillWindow platform={fake.platform} />);
    await flushEffects();
    act(() => {
      fake.pushSnapshot(snapshot({ revision: 2, title: '新快照' }));
      fake.pushSnapshot(snapshot({ revision: 1, title: '旧快照' }));
      fake.pushSnapshot({ revision: 3, title: '残缺快照' });
    });
    fireEvent.click(screen.getByRole('button', { name: '展开魔丸' }), { detail: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });

    expect(screen.getByText('新快照')).toBeInTheDocument();
    expect(screen.queryByText('旧快照')).not.toBeInTheDocument();
    expect(screen.queryByText('残缺快照')).not.toBeInTheDocument();
  });

  it('collapses on blur and suppresses click behavior after a drag', async () => {
    const fake = platformFake();
    render(<MagicPillWindow platform={fake.platform} />);
    await flushEffects();
    const core = screen.getByRole('button', { name: '展开魔丸' });
    fireEvent.click(core, { detail: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });

    act(() => fake.blur());
    await flushEffects();
    expect(fake.platform.resize).toHaveBeenLastCalledWith(false);

    const surface = screen.getByTestId('magic-pill-surface');
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 20, clientY: 10, buttons: 1 });
    fireEvent.pointerUp(surface, { clientX: 20, clientY: 10, button: 0 });
    fireEvent.click(surface, { detail: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });

    expect(fake.platform.startDragging).toHaveBeenCalledOnce();
    expect(fake.platform.resize).toHaveBeenCalledTimes(2);
  });
});
