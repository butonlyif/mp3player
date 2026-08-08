import { describe, expect, it } from 'vitest';
import type { Track } from '../lib/api';
import { folderQueue, sortAlbumQueue } from './contextQueue';

const track = (id: number, file_name: string, fields: Partial<Track> = {}): Track => ({
  id,
  path: `/music/${file_name}`,
  file_name,
  title: null,
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
  ...fields,
});

describe('context queues', () => {
  it('orders an album by disc, track number, then filename with missing tags last', () => {
    const input = [
      track(4, 'unknown.mp3'),
      track(3, 'disc-two.mp3', { disc_no: 2, track_no: 1 }),
      track(2, 'second.mp3', { disc_no: 1, track_no: 2 }),
      track(1, 'first.mp3', { disc_no: 1, track_no: 1 }),
      track(5, 'alpha-unknown.mp3'),
    ];

    expect(sortAlbumQueue(input).map((item) => item.id)).toEqual([1, 2, 3, 5, 4]);
    expect(input.map((item) => item.id)).toEqual([4, 3, 2, 1, 5]);
  });

  it('keeps the supplied current folder level stable and returns a copy', () => {
    const input = [track(2, 'b.mp3'), track(1, 'a.mp3')];
    const queue = folderQueue(input);

    expect(queue.map((item) => item.id)).toEqual([2, 1]);
    expect(queue).not.toBe(input);
  });
});
