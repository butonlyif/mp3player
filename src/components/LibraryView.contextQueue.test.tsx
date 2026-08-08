// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
});
import type { Track } from '../lib/api';
import { useStore } from '../store/useStore';
import LibraryView from './LibraryView';

const track = (id: number, title: string, fields: Partial<Track> = {}): Track => ({
  id,
  path: `/music/${title}.mp3`,
  file_name: `${title}.mp3`,
  title,
  artist: 'Soul Play',
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

afterEach(() => {
  cleanup();
  useStore.setState({ tracks: [], currentTrack: null, playQueue: [], playQueueIndex: 0, searchQuery: '' });
});

describe('LibraryView contextual playback queues', () => {
  it('plays only the selected album in disc and track order', () => {
    const selected = track(2, '第二首', { album: '夜航', album_artist: '远岸', disc_no: 1, track_no: 2 });
    useStore.setState({
      libraryMode: 'album',
      tracks: [
        selected,
        track(1, '第一首', { album: '夜航', album_artist: '远岸', disc_no: 1, track_no: 1 }),
        track(4, '同名别辑', { album: '夜航', album_artist: '另一位' }),
        track(3, '别的专辑', { album: '白昼' }),
      ],
    });
    render(<LibraryView />);

    fireEvent.click(screen.getByText(/远岸 · 2 首/).closest('.album-header')!);
    fireEvent.doubleClick(screen.getByText('第二首'));

    expect(useStore.getState().playQueue.map((item) => item.id)).toEqual([1, 2]);
    expect(useStore.getState().currentTrack?.id).toBe(2);
  });

  it('plays only tracks in the current folder level and excludes child folders', () => {
    const selected = track(11, '同层二', { folder_path: '/Music/A' });
    useStore.setState({
      libraryMode: 'folder',
      tracks: [track(10, '同层一', { folder_path: '/Music/A' }), selected, track(12, '子层', { folder_path: '/Music/A/Child' })],
    });
    render(<LibraryView />);

    fireEvent.click(screen.getByText('Music'));
    fireEvent.click(screen.getByText('A'));
    fireEvent.doubleClick(screen.getByText('同层二'));

    expect(useStore.getState().playQueue.map((item) => item.id)).toEqual([10, 11]);
    expect(useStore.getState().currentTrack?.id).toBe(11);
  });
});
