import type { ResonanceLevel, Track } from '../lib/api';

export type ResonanceSortDirection = 'asc' | 'desc';

export const RESONANCE_LABELS: Record<ResonanceLevel, string> = {
  0: '无感',
  1: '有感觉',
  2: '共鸣',
  3: '灵魂曲',
};

export function trackDisplayTitle(track: Pick<Track, 'title' | 'file_name'>): string {
  const title = track.title?.trim();
  if (title) return title;
  const stripped = track.file_name.replace(/\.[^.]+$/, '');
  return stripped || track.file_name;
}

export function nextResonance(level: ResonanceLevel): ResonanceLevel {
  return ((level + 1) % 4) as ResonanceLevel;
}

export function sortByResonanceStable(
  tracks: Track[],
  direction: ResonanceSortDirection,
): Track[] {
  const factor = direction === 'asc' ? 1 : -1;
  return tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (a.track.resonance - b.track.resonance) * factor || a.index - b.index)
    .map(({ track }) => track);
}
