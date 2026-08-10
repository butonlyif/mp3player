// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    startDragging: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

import TitleBar from './TitleBar';

afterEach(cleanup);

describe('TitleBar', () => {
  it('exposes and invokes Magic Pill mode', () => {
    const onEnterMagicPill = vi.fn();
    render(<TitleBar onEnterMagicPill={onEnterMagicPill} />);
    fireEvent.click(screen.getByRole('button', { name: '进入魔丸模式' }));
    expect(onEnterMagicPill).toHaveBeenCalledOnce();
  });

  it('renders all window control buttons', () => {
    render(<TitleBar onEnterMagicPill={vi.fn()} />);
    expect(screen.getByRole('button', { name: '进入魔丸模式' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最小化' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最大化' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });
});
