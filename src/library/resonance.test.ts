import { describe, expect, it } from 'vitest';
import type { Track } from '../lib/api';
import { nextResonance, sortByResonanceStable, trackDisplayTitle } from './resonance';

const track = (id: number, resonance: Track['resonance'], title: string | null = `Track ${id}`): Track => ({
  id,
  path: `/music/${id}.mp3`,
  file_name: `${id}.mp3`,
  title,
  artist: null,
  album: null,
  album_artist: null,
  folder_path: '/music',
  genre: null,
  year: null,
  track_no: null,
  disc_no: null,
  duration: 180,
  bitrate: null,
  sample_rate: null,
  has_lyrics: 0,
  lyrics_type: null,
  resonance,
});

describe('resonance domain', () => {
  it('uses the metadata title and falls back to a filename without its final extension', () => {
    expect(trackDisplayTitle({ ...track(1, 0), title: 'Song', file_name: 'file.mp3' })).toBe('Song');
    expect(trackDisplayTitle({ ...track(2, 0), title: null, file_name: 'Song.demo.mp3' })).toBe('Song.demo');
  });

  it('cycles through the four relationship levels', () => {
    expect(([0, 1, 2, 3] as const).map(nextResonance)).toEqual([1, 2, 3, 0]);
  });

  it('sorts resonance in either direction while preserving equal-level order', () => {
    const input = [track(1, 1), track(2, 3), track(3, 1), track(4, 0)];
    expect(sortByResonanceStable(input, 'desc').map((item) => item.id)).toEqual([2, 1, 3, 4]);
    expect(sortByResonanceStable(input, 'asc').map((item) => item.id)).toEqual([4, 1, 3, 2]);
  });
});
