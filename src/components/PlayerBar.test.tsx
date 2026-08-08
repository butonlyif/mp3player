// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerBar from './PlayerBar';

afterEach(cleanup);

const baseProps = {
  isPlaying: false,
  currentTime: 0,
  duration: 120,
  volume: 0.8,
  title: '风景与你',
  artist: 'Peter',
  album: null,
  coverArt: null,
  lyricsActive: false,
  eqActive: false,
  immersiveActive: false,
  playMode: 'sequence' as const,
  onTogglePlay: vi.fn(), onNext: vi.fn(), onPrev: vi.fn(), onSeek: vi.fn(),
  onVolumeChange: vi.fn(), onToggleLyrics: vi.fn(), onToggleEq: vi.fn(),
  onToggleImmersive: vi.fn(), onCyclePlayMode: vi.fn(),
};

describe('PlayerBar immersive control', () => {
  it('enters immersive mode without changing playback controls', () => {
    const onToggleImmersive = vi.fn();
    render(<PlayerBar {...baseProps} onToggleImmersive={onToggleImmersive} />);

    fireEvent.click(screen.getByRole('button', { name: '进入沉浸模式' }));
    expect(onToggleImmersive).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '播放' })).toBeEnabled();
  });

  it('disables immersive mode when no track is loaded', () => {
    render(<PlayerBar {...baseProps} title={null} />);
    expect(screen.getByRole('button', { name: '进入沉浸模式' })).toBeDisabled();
  });
});
