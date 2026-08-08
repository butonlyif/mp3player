// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackShortcuts, type PlaybackShortcutActions } from './usePlaybackShortcuts';

afterEach(cleanup);

function actions(overrides: Partial<PlaybackShortcutActions> = {}): PlaybackShortcutActions {
  return {
    hasTrack: true,
    isPlaying: false,
    currentTime: 20,
    duration: 100,
    volume: 0.8,
    immersiveMode: false,
    showBatchTag: false,
    showLyrics: false,
    showEq: false,
    setPlaying: vi.fn(),
    seek: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    setVolume: vi.fn(),
    setImmersiveMode: vi.fn(),
    toggleLyrics: vi.fn(),
    toggleEq: vi.fn(),
    closeBatchTag: vi.fn(),
    ...overrides,
  };
}

const press = (key: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...options });
  act(() => window.dispatchEvent(event));
  return event;
};

describe('usePlaybackShortcuts', () => {
  it('maps playback, seek, volume, and track commands to bounded actions', () => {
    const current = actions({ currentTime: 98, volume: 0.98 });
    renderHook(() => usePlaybackShortcuts(current));

    expect(press(' ').defaultPrevented).toBe(true);
    press('ArrowRight');
    press('ArrowUp');
    press('ArrowLeft', { shiftKey: true });

    expect(current.setPlaying).toHaveBeenCalledWith(true);
    expect(current.seek).toHaveBeenCalledWith(100);
    expect(current.setVolume).toHaveBeenCalledWith(1);
    expect(current.previous).toHaveBeenCalledOnce();
  });

  it('mutes and restores the latest non-zero volume', () => {
    const first = actions({ volume: 0.72 });
    const { rerender } = renderHook(({ value }) => usePlaybackShortcuts(value), { initialProps: { value: first } });
    press('m');
    expect(first.setVolume).toHaveBeenCalledWith(0);

    const muted = actions({ volume: 0, setVolume: first.setVolume });
    rerender({ value: muted });
    press('m');
    expect(first.setVolume).toHaveBeenLastCalledWith(0.72);
  });

  it('gives Escape priority to immersive mode, then batch editor, then drawers', () => {
    const immersive = actions({ immersiveMode: true, showBatchTag: true, showLyrics: true });
    const { rerender } = renderHook(({ value }) => usePlaybackShortcuts(value), { initialProps: { value: immersive } });
    press('Escape');
    expect(immersive.setImmersiveMode).toHaveBeenCalledWith(false);
    expect(immersive.closeBatchTag).not.toHaveBeenCalled();

    const batch = actions({ showBatchTag: true, showLyrics: true });
    rerender({ value: batch });
    press('Escape');
    expect(batch.closeBatchTag).toHaveBeenCalledOnce();
    expect(batch.toggleLyrics).not.toHaveBeenCalled();

    const drawer = actions({ showLyrics: true });
    rerender({ value: drawer });
    press('Escape');
    expect(drawer.toggleLyrics).toHaveBeenCalledOnce();
  });

  it('removes the listener on unmount', () => {
    const current = actions();
    const { unmount } = renderHook(() => usePlaybackShortcuts(current));
    unmount();
    press(' ');
    expect(current.setPlaying).not.toHaveBeenCalled();
  });
});
