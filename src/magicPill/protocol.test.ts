import { describe, expect, it } from 'vitest';
import {
  acceptSnapshot,
  isMagicPillCommand,
  type MagicPillSnapshot,
} from './protocol';

const snapshot = (revision: number): MagicPillSnapshot => ({
  version: 1,
  revision,
  trackId: 7,
  title: '风景与你',
  artist: 'Peter',
  palette: ['rgb(220 120 80)', 'rgb(90 50 120)', 'rgb(24 20 35)'],
  isPlaying: true,
});

describe('Magic Pill protocol', () => {
  it('accepts only the four command variants', () => {
    expect(isMagicPillCommand({ type: 'previous' })).toBe(true);
    expect(isMagicPillCommand({ type: 'toggle-playback' })).toBe(true);
    expect(isMagicPillCommand({ type: 'next' })).toBe(true);
    expect(isMagicPillCommand({ type: 'restore-main' })).toBe(true);
    expect(isMagicPillCommand({ type: 'seek', time: 4 })).toBe(false);
    expect(isMagicPillCommand(null)).toBe(false);
  });

  it('accepts only complete version-one snapshots newer than the current revision', () => {
    expect(acceptSnapshot(4, snapshot(5))).toEqual(snapshot(5));
    expect(acceptSnapshot(5, snapshot(5))).toBeNull();
    expect(acceptSnapshot(6, snapshot(5))).toBeNull();
    expect(acceptSnapshot(0, { ...snapshot(2), palette: ['rgb(1 1 1)'] })).toBeNull();
    expect(acceptSnapshot(0, { ...snapshot(2), version: 2 })).toBeNull();
  });
});
