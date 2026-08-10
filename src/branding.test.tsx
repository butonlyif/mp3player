// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ startDragging: vi.fn(), minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() }),
}));

import { APP_NAME } from './branding';
import TitleBar from './components/TitleBar';

afterEach(cleanup);

describe('Soul Play branding', () => {
  it('uses one exact application name in the custom titlebar', () => {
    render(<TitleBar onEnterMagicPill={vi.fn()} />);
    expect(APP_NAME).toBe('Soul Play');
    expect(screen.getByText(APP_NAME)).toBeVisible();
  });
});
