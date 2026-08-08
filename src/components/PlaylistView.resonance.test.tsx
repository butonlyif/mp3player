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
import { api } from '../lib/api';
import type { Track } from '../lib/api';
import { useStore } from '../store/useStore';
import PlaylistView from './PlaylistView';

const track = (id: number, title: string, resonance: Track['resonance']): Track => ({
  id, path: `/music/${id}.mp3`, file_name: `${title}.mp3`, title, artist: null, album: null,
  album_artist: null, folder_path: '/music', genre: null, year: null, track_no: null,
  disc_no: null, duration: 180, bitrate: null, sample_rate: null, has_lyrics: 0,
  lyrics_type: null, resonance,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlaylistView resonance', () => {
  it('shows soul marks and plays in the visible resonance order without persisting a reorder', () => {
    vi.spyOn(api.library, 'updateResonance').mockResolvedValue(undefined);
    useStore.setState({
      playlists: [{ id: 1, name: '夜航', created_at: 0, updated_at: 0 }],
      currentPlaylistId: 1,
      playlistTracks: [track(1, '有感觉', 1), track(2, '灵魂曲', 3), track(3, '共鸣', 2)],
      sortBy: 'resonance',
      sortOrder: 'desc',
    });

    render(<PlaylistView />);
    fireEvent.doubleClick(screen.getByText('共鸣'));

    expect(useStore.getState().playQueue.map((item) => item.id)).toEqual([2, 3, 1]);
    expect(screen.getAllByRole('button', { name: /点击修改/ })).toHaveLength(3);
    expect(useStore.getState().playlistTracks.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
