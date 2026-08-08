// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEditableShortcutTarget, resolvePlaybackShortcut } from './playbackShortcuts';

const keyEvent = (key: string, options: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });

describe('resolvePlaybackShortcut', () => {
  it.each([
    [' ', {}, { type: 'toggle-play' }],
    ['ArrowLeft', {}, { type: 'seek-relative', seconds: -5 }],
    ['ArrowRight', {}, { type: 'seek-relative', seconds: 5 }],
    ['ArrowLeft', { shiftKey: true }, { type: 'track-relative', direction: -1 }],
    ['ArrowRight', { shiftKey: true }, { type: 'track-relative', direction: 1 }],
    ['ArrowUp', {}, { type: 'volume-relative', amount: 0.05 }],
    ['ArrowDown', {}, { type: 'volume-relative', amount: -0.05 }],
    ['i', {}, { type: 'toggle-immersive' }],
    ['L', {}, { type: 'toggle-lyrics' }],
    ['e', {}, { type: 'toggle-eq' }],
    ['M', {}, { type: 'toggle-mute' }],
    ['Escape', {}, { type: 'escape' }],
  ])('maps %s to a semantic command', (key, options, expected) => {
    expect(resolvePlaybackShortcut(keyEvent(key as string, options))).toEqual(expected);
  });

  it('ignores repeated toggles but allows repeated seek and volume', () => {
    expect(resolvePlaybackShortcut(keyEvent('i', { repeat: true }))).toBeNull();
    expect(resolvePlaybackShortcut(keyEvent('Escape', { repeat: true }))).toBeNull();
    expect(resolvePlaybackShortcut(keyEvent('ArrowRight', { repeat: true }))).toEqual({ type: 'seek-relative', seconds: 5 });
    expect(resolvePlaybackShortcut(keyEvent('ArrowUp', { repeat: true }))).toEqual({ type: 'volume-relative', amount: 0.05 });
  });

  it('ignores unknown and modified keys', () => {
    expect(resolvePlaybackShortcut(keyEvent('x'))).toBeNull();
    expect(resolvePlaybackShortcut(keyEvent('l', { metaKey: true }))).toBeNull();
    expect(resolvePlaybackShortcut(keyEvent(' ', { ctrlKey: true }))).toBeNull();
    expect(resolvePlaybackShortcut(keyEvent('Escape', { isComposing: true }))).toBeNull();
    const handled = keyEvent(' ');
    handled.preventDefault();
    expect(resolvePlaybackShortcut(handled)).toBeNull();
  });

  it('preserves native keyboard behavior on interactive controls', () => {
    const button = document.createElement('button');
    const link = document.createElement('a');
    link.href = '#player';
    for (const target of [button, link]) {
      let resolved: ReturnType<typeof resolvePlaybackShortcut> = { type: 'escape' };
      target.addEventListener('keydown', (event) => { resolved = resolvePlaybackShortcut(event as KeyboardEvent); });
      target.dispatchEvent(keyEvent(' '));
      expect(resolved).toBeNull();
    }
  });
});

describe('isEditableShortcutTarget', () => {
  it('recognizes form controls and nested contenteditable targets', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    const child = document.createElement('span');
    editable.append(child);

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(child)).toBe(true);
    expect(isEditableShortcutTarget(document.body)).toBe(false);
  });
});
