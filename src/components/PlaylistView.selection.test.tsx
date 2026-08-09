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
import { api } from '../lib/api';
import PlaylistView from './PlaylistView';

const track = (id: number): Track => ({
  id, path: `/music/${id}.mp3`, file_name: `${id}.mp3`, title: `歌曲 ${id}`, artist: null,
  album: null, album_artist: null, folder_path: '/music', genre: null, year: null,
  track_no: null, disc_no: null, duration: 180, bitrate: null, sample_rate: null,
  has_lyrics: 0, lyrics_type: null, resonance: 0,
});

afterEach(() => {
  cleanup();
  useStore.getState().clearSelection();
});

describe('PlaylistView desktop selection', () => {
  it('supports range and modifier selection in visible order', () => {
    useStore.setState({
      playlists: [{ id: 1, name: '夜航', created_at: 0, updated_at: 0 }],
      currentPlaylistId: 1,
      playlistTracks: [track(1), track(2), track(3)],
      sortBy: 'title',
      sortOrder: 'asc',
      selectedTrackIds: new Set(),
      _lastSelectedId: null,
    });
    render(<PlaylistView />);

    fireEvent.click(screen.getByText('歌曲 1'));
    fireEvent.click(screen.getByText('歌曲 3'), { shiftKey: true });
    expect([...useStore.getState().selectedTrackIds]).toEqual([1, 2, 3]);

    fireEvent.click(screen.getByText('歌曲 2'), { metaKey: true });
    expect([...useStore.getState().selectedTrackIds]).toEqual([1, 3]);
  });

  it('clears selection with Escape and exposes a dedicated reorder handle', () => {
    useStore.setState({
      playlists: [{ id: 1, name: '夜航', created_at: 0, updated_at: 0 }],
      currentPlaylistId: 1,
      playlistTracks: [track(1), track(2)],
      selectedTrackIds: new Set([1]),
      _lastSelectedId: 1,
      sortBy: 'title',
    });
    render(<PlaylistView />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useStore.getState().selectedTrackIds.size).toBe(0);
    expect(screen.getAllByRole('button', { name: '拖动排序' })).toHaveLength(2);
  });

  it('keeps library removal and local-file deletion available for playlist selections', async () => {
    useStore.setState({
      playlists: [{ id: 1, name: '夜航', created_at: 0, updated_at: 0 }],
      currentPlaylistId: 1,
      playlistTracks: [track(1), track(2)],
      selectedTrackIds: new Set([1, 2]),
      _lastSelectedId: 1,
      sortBy: 'title',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(api.library, 'deleteTracks').mockResolvedValue(undefined);
    vi.spyOn(api.playlist, 'getTracks').mockResolvedValue([]);
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole('button', { name: '删除本地文件' }));

    await vi.waitFor(() => expect(api.library.deleteTracks).toHaveBeenCalledWith([1, 2], true));
    expect(screen.getByRole('button', { name: '从音乐库移除' })).toBeInTheDocument();
  });
});
