// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Icon from './Icon';

describe('Icon', () => {
  it('renders decorative vectors without adding duplicate accessible text', () => {
    render(<button aria-label="编辑标签"><Icon name="edit" /></button>);

    expect(screen.getByRole('button', { name: '编辑标签' })).toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
