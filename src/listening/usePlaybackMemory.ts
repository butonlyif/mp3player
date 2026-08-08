import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { isMeaningfulPlay, resumePosition, shouldPersistProgress } from './playbackMemory';

interface PlaybackMemoryOptions {
  trackId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  seek: (time: number) => boolean;
}

export function usePlaybackMemory({ trackId, isPlaying, currentTime, duration, seek }: PlaybackMemoryOptions): void {
  const session = useRef({
    trackId: null as number | null,
    listened: 0,
    lastPosition: 0,
    lastWritePosition: 0,
    lastWriteAt: 0,
    duration: 0,
    counted: false,
    counting: false,
    userProgressed: false,
  });
  const [pendingResume, setPendingResume] = useState<{ trackId: number; position: number } | null>(null);

  useEffect(() => {
    if (trackId === null) return;
    session.current = {
      trackId,
      listened: 0,
      lastPosition: 0,
      lastWritePosition: 0,
      lastWriteAt: Date.now(),
      duration,
      counted: false,
      counting: false,
      userProgressed: false,
    };
    let active = true;
    api.playback.getResume(trackId)
      .then((position) => {
        if (active && position !== null) setPendingResume({ trackId, position });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      const state = session.current;
      if (state.trackId === trackId && state.lastPosition > 0) {
        const storedPosition = resumePosition(state.duration, state.lastPosition) ?? 0;
        api.playback.record(trackId, storedPosition, false).catch(() => undefined);
      }
    };
  }, [trackId]);

  useEffect(() => {
    const pending = pendingResume;
    if (!pending || pending.trackId !== trackId || session.current.userProgressed) return;
    const position = resumePosition(duration, pending.position);
    if (position === null || seek(position)) setPendingResume(null);
  }, [duration, pendingResume, seek, trackId]);

  useEffect(() => {
    if (trackId === null || session.current.trackId !== trackId) return;
    const state = session.current;
    state.duration = duration;
    const delta = currentTime - state.lastPosition;
    if (state.lastPosition >= duration - 10 && currentTime < 5) {
      state.listened = 0;
      state.counted = false;
      state.counting = false;
      state.userProgressed = false;
    }
    if (isPlaying && delta > 0 && delta <= 2.5) state.listened += delta;
    if (Math.abs(delta) > 2.5) state.userProgressed = true;
    state.lastPosition = currentTime;

    const now = Date.now();
    const newlyMeaningful = !state.counted && !state.counting && isMeaningfulPlay(state.listened);
    const shouldWrite = shouldPersistProgress(currentTime, state.lastWritePosition, now, state.lastWriteAt);
    if (!newlyMeaningful && !shouldWrite) return;

    if (newlyMeaningful) state.counting = true;
    state.lastWriteAt = now;
    state.lastWritePosition = currentTime;
    const storedPosition = resumePosition(duration, currentTime) ?? 0;
    api.playback.record(trackId, storedPosition, newlyMeaningful)
      .then(() => {
        if (newlyMeaningful) state.counted = true;
        state.counting = false;
      })
      .catch(() => { state.counting = false; });
  }, [currentTime, duration, isPlaying, trackId]);

  useEffect(() => {
    if (trackId === null || isPlaying) return;
    const state = session.current;
    if (state.trackId !== trackId || state.lastPosition <= 0) return;
    const storedPosition = resumePosition(duration, state.lastPosition) ?? 0;
    api.playback.record(trackId, storedPosition, false).catch(() => undefined);
  }, [duration, isPlaying, trackId]);
}
