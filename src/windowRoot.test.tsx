import { expect, it } from 'vitest';
import { windowRootForLabel } from './windowRoot';

it('routes only the dedicated label to the pill root', () => {
  expect(windowRootForLabel('magic-pill')).toBe('magic-pill');
  expect(windowRootForLabel('main')).toBe('main');
  expect(windowRootForLabel('unexpected')).toBe('main');
});
