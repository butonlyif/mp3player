import type { Track } from '../lib/api';

const taggedNumber = (value: number | null) => value ?? Number.POSITIVE_INFINITY;

export function sortAlbumQueue(tracks: Track[]): Track[] {
  return [...tracks].sort((left, right) =>
    taggedNumber(left.disc_no) - taggedNumber(right.disc_no)
    || taggedNumber(left.track_no) - taggedNumber(right.track_no)
    || left.file_name.localeCompare(right.file_name, 'zh-CN'),
  );
}

export function folderQueue(tracks: Track[]): Track[] {
  return [...tracks];
}
