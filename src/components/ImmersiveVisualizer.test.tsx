// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImmersiveVisualizer from './ImmersiveVisualizer';

describe('ImmersiveVisualizer', () => {
  it('keeps track metadata and exit controls available with motion disabled', () => {
    const onExit = vi.fn();
    render(
      <ImmersiveVisualizer
        trackKey="42"
        title="风景与你.mp3"
        lyric="夏天仍在继续"
        nextLyric="风吹向很远的地方"
        coverArt={null}
      isPlaying={false}
      currentTime={0}
      duration={180}
        motionEnabled={false}
        onExit={onExit}
        onMotionChange={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: '沉浸式音乐视觉' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '风景与你' })).toBeInTheDocument();
    expect(screen.getByText('夏天仍在继续')).toBeInTheDocument();
    expect(screen.getByText('风吹向很远的地方')).toBeInTheDocument();
    expect(screen.queryByText('Peter')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '动态效果' })).not.toBeChecked();
    expect(screen.queryByTestId('liquid-particles')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '退出沉浸模式' }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
