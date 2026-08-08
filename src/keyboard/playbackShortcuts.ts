export type PlaybackShortcutCommand =
  | { type: 'toggle-play' }
  | { type: 'seek-relative'; seconds: number }
  | { type: 'track-relative'; direction: -1 | 1 }
  | { type: 'volume-relative'; amount: number }
  | { type: 'toggle-immersive' }
  | { type: 'toggle-lyrics' }
  | { type: 'toggle-eq' }
  | { type: 'toggle-mute' }
  | { type: 'escape' };

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select')) return true;
  let element: Element | null = target;
  while (element) {
    const editable = (element as HTMLElement).contentEditable;
    if (editable === 'true' || element.getAttribute('contenteditable') === '') return true;
    if (editable === 'false') return false;
    element = element.parentElement;
  }
  return false;
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('button, a[href], summary, [role="button"], [role="link"]') !== null;
}

export function resolvePlaybackShortcut(event: KeyboardEvent): PlaybackShortcutCommand | null {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return null;
  const key = event.key.toLowerCase();

  if (key === 'escape') return event.repeat ? null : { type: 'escape' };
  if (isEditableShortcutTarget(event.target)) return null;
  if (isInteractiveShortcutTarget(event.target)) return null;
  if (key === 'arrowleft') {
    if (event.shiftKey) return event.repeat ? null : { type: 'track-relative', direction: -1 };
    return { type: 'seek-relative', seconds: -5 };
  }
  if (key === 'arrowright') {
    if (event.shiftKey) return event.repeat ? null : { type: 'track-relative', direction: 1 };
    return { type: 'seek-relative', seconds: 5 };
  }
  if (!event.shiftKey && key === 'arrowup') return { type: 'volume-relative', amount: 0.05 };
  if (!event.shiftKey && key === 'arrowdown') return { type: 'volume-relative', amount: -0.05 };
  if (event.repeat) return null;
  if (key === ' ') return { type: 'toggle-play' };
  if (key === 'i') return { type: 'toggle-immersive' };
  if (key === 'l') return { type: 'toggle-lyrics' };
  if (key === 'e') return { type: 'toggle-eq' };
  if (key === 'm') return { type: 'toggle-mute' };
  return null;
}
