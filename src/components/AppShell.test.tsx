// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppShell from './AppShell';

describe('AppShell', () => {
  it('removes daily navigation, drawer, and player while immersive content is active', () => {
    render(
      <AppShell
        immersive
        titleBar={<div>标题栏</div>}
        sidebar={<nav>音乐库导航</nav>}
        main={<main>曲目列表</main>}
        drawer={<aside>歌词抽屉</aside>}
        player={<footer>普通播放栏</footer>}
        immersiveContent={<section aria-label="沉浸式音乐视觉">沉浸歌词</section>}
      />,
    );

    expect(screen.getByText('标题栏')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '沉浸式音乐视觉' })).toBeInTheDocument();
    expect(screen.queryByText('音乐库导航')).not.toBeInTheDocument();
    expect(screen.queryByText('歌词抽屉')).not.toBeInTheDocument();
    expect(screen.queryByText('普通播放栏')).not.toBeInTheDocument();
  });
});
