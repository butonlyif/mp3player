import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { Track } from '../lib/api';
import { useStore } from './useStore';

const track = (id: number, resonance: Track['resonance']): Track => ({
  id,
  path: `/music/${id}.mp3`,
  file_name: `${id}.mp3`,
  title: `Track ${id}`,
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

afterEach(() => vi.restoreAllMocks());

describe('visualizer UI state', () => {
  it('toggles immersive and reactive-motion state independently', () => {
    const store = useStore.getState();
    store.setImmersiveMode(true);
    store.setReactiveMotionEnabled(false);

    expect(useStore.getState().immersiveMode).toBe(true);
    expect(useStore.getState().reactiveMotionEnabled).toBe(false);

    useStore.getState().setImmersiveMode(false);
    useStore.getState().setReactiveMotionEnabled(true);
  });
});

describe('track resonance state', () => {
  it('updates every reference immediately and persists it', async () => {
    let finish!: () => void;
    vi.spyOn(api.library, 'updateResonance').mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const original = track(1, 0);
    useStore.setState({
      tracks: [original],
      playlistTracks: [original],
      currentTrack: original,
      playQueue: [original],
    });

    const pending = useStore.getState().setTrackResonance(1, 3);
    expect(useStore.getState().tracks[0].resonance).toBe(3);
    expect(useStore.getState().playlistTracks[0].resonance).toBe(3);
    expect(useStore.getState().currentTrack?.resonance).toBe(3);
    expect(useStore.getState().playQueue[0].resonance).toBe(3);

    finish();
    await pending;
    expect(api.library.updateResonance).toHaveBeenCalledWith(1, 3);
  });

  it('rolls back every reference when persistence fails', async () => {
    vi.spyOn(api.library, 'updateResonance').mockRejectedValue(new Error('disk full'));
    const original = track(2, 1);
    useStore.setState({
      tracks: [original],
      playlistTracks: [original],
      currentTrack: original,
      playQueue: [original],
    });

    await expect(useStore.getState().setTrackResonance(2, 2)).rejects.toThrow('disk full');
    expect(useStore.getState().tracks[0].resonance).toBe(1);
    expect(useStore.getState().playlistTracks[0].resonance).toBe(1);
    expect(useStore.getState().currentTrack?.resonance).toBe(1);
    expect(useStore.getState().playQueue[0].resonance).toBe(1);
  });

  it('serializes rapid changes and rolls back to the last confirmed database value', async () => {
    const rejects: Array<(error: Error) => void> = [];
    vi.spyOn(api.library, 'updateResonance').mockImplementation(
      () => new Promise<void>((_, reject) => rejects.push(reject)),
    );
    const original = track(7, 0);
    useStore.setState({ tracks: [original], playlistTracks: [], currentTrack: original, playQueue: [original] });

    const first = useStore.getState().setTrackResonance(7, 1);
    const second = useStore.getState().setTrackResonance(7, 2);
    await vi.waitFor(() => expect(api.library.updateResonance).toHaveBeenCalledTimes(1));
    rejects[0](new Error('first failed'));
    await vi.waitFor(() => expect(api.library.updateResonance).toHaveBeenCalledTimes(2));
    rejects[1](new Error('second failed'));
    await Promise.allSettled([first, second]);

    expect(useStore.getState().tracks[0].resonance).toBe(0);
  });

  it('reorders a resonance-sorted play queue and keeps the active track index', async () => {
    vi.spyOn(api.library, 'updateResonance').mockResolvedValue(undefined);
    const first = track(11, 3);
    const active = track(12, 2);
    const last = track(13, 1);
    useStore.setState({
      tracks: [first, active, last],
      playQueue: [first, active, last],
      playQueueIndex: 1,
      currentTrack: active,
      sortBy: 'resonance',
      sortOrder: 'desc',
    });

    await useStore.getState().setTrackResonance(13, 3);

    expect(useStore.getState().playQueue.map((item) => item.id)).toEqual([11, 13, 12]);
    expect(useStore.getState().playQueueIndex).toBe(2);
  });

  it('uses the matching playlist reference as rollback baseline', async () => {
    vi.spyOn(api.library, 'updateResonance').mockRejectedValue(new Error('write failed'));
    const target = track(99, 2);
    useStore.setState({
      tracks: [],
      playlistTracks: [target],
      playQueue: [target],
      currentTrack: track(100, 3),
      sortBy: 'title',
    });

    await expect(useStore.getState().setTrackResonance(99, 1)).rejects.toThrow('write failed');

    expect(useStore.getState().playlistTracks[0].resonance).toBe(2);
    expect(useStore.getState().currentTrack?.resonance).toBe(3);
  });
});

describe('resonance sorting', () => {
  it('cycles high-to-low, low-to-high, then restores the previous sort', () => {
    useStore.setState({ sortBy: 'album', sortOrder: 'asc', sortBeforeResonance: null });

    useStore.getState().setSortBy('resonance');
    expect(useStore.getState()).toMatchObject({ sortBy: 'resonance', sortOrder: 'desc' });

    useStore.getState().setSortBy('resonance');
    expect(useStore.getState()).toMatchObject({ sortBy: 'resonance', sortOrder: 'asc' });

    useStore.getState().setSortBy('resonance');
    expect(useStore.getState()).toMatchObject({ sortBy: 'album', sortOrder: 'asc', sortBeforeResonance: null });
  });
});
