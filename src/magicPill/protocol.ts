export const MAGIC_PILL_READY = 'magic-pill://ready';
export const MAGIC_PILL_SNAPSHOT = 'magic-pill://snapshot';
export const MAGIC_PILL_COMMAND = 'magic-pill://command';

export interface MagicPillSnapshot {
  version: 1;
  revision: number;
  trackId: number | null;
  title: string;
  artist: string;
  palette: [string, string, string];
  isPlaying: boolean;
}

export type MagicPillCommand =
  | { type: 'previous' }
  | { type: 'toggle-playback' }
  | { type: 'next' }
  | { type: 'restore-main' };

const COMMANDS = new Set<MagicPillCommand['type']>([
  'previous',
  'toggle-playback',
  'next',
  'restore-main',
]);

export function isMagicPillCommand(value: unknown): value is MagicPillCommand {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && COMMANDS.has(type as MagicPillCommand['type']);
}

function isMagicPillSnapshot(value: unknown): value is MagicPillSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MagicPillSnapshot>;
  return candidate.version === 1
    && typeof candidate.revision === 'number'
    && Number.isSafeInteger(candidate.revision)
    && candidate.revision >= 0
    && (candidate.trackId === null
      || (typeof candidate.trackId === 'number' && Number.isSafeInteger(candidate.trackId)))
    && typeof candidate.title === 'string'
    && typeof candidate.artist === 'string'
    && Array.isArray(candidate.palette)
    && candidate.palette.length === 3
    && candidate.palette.every((color) => typeof color === 'string')
    && typeof candidate.isPlaying === 'boolean';
}

export function acceptSnapshot(
  currentRevision: number,
  next: unknown,
): MagicPillSnapshot | null {
  return isMagicPillSnapshot(next) && next.revision > currentRevision ? next : null;
}
