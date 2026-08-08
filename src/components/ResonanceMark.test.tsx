// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResonanceMark from './ResonanceMark';

afterEach(cleanup);

describe('ResonanceMark', () => {
  it('cycles to the next relationship level without activating its row', () => {
    const onChange = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <ResonanceMark level={2} onChange={onChange} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: '共鸣 · 点击修改' }));

    expect(onChange).toHaveBeenCalledWith(3);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('keeps the unrated line visually empty and offers direct level choices', () => {
    const onChange = vi.fn();
    render(<ResonanceMark level={0} onChange={onChange} />);

    expect(screen.getByTestId('resonance-line')).toHaveClass('level-0');
    fireEvent.click(screen.getByRole('button', { name: '设为灵魂曲' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('supports keyboard activation through the main button', () => {
    const onChange = vi.fn();
    render(<ResonanceMark level={1} onChange={onChange} />);

    const button = screen.getByRole('button', { name: '有感觉 · 点击修改' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
