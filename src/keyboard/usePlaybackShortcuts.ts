import { useEffect, useRef } from 'react';
import { resolvePlaybackShortcut } from './playbackShortcuts';

export interface PlaybackShortcutActions {
  hasTrack: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  immersiveMode: boolean;
  showBatchTag: boolean;
  showLyrics: boolean;
  showEq: boolean;
  setPlaying: (playing: boolean) => void;
  seek: (time: number) => void;
  previous: () => void;
  next: () => void;
  setVolume: (volume: number) => void;
  setImmersiveMode: (enabled: boolean) => void;
  toggleLyrics: () => void;
  toggleEq: () => void;
  closeBatchTag: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function usePlaybackShortcuts(actions: PlaybackShortcutActions): void {
  const actionsRef = useRef(actions);
  const lastNonZeroVolume = useRef(actions.volume > 0 ? actions.volume : 0.8);
  actionsRef.current = actions;
  if (actions.volume > 0.001) lastNonZeroVolume.current = actions.volume;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const command = resolvePlaybackShortcut(event);
      if (!command) return;

      const current = actionsRef.current;
      let handled = true;

      switch (command.type) {
        case 'toggle-play':
          if (current.hasTrack) current.setPlaying(!current.isPlaying);
          else handled = false;
          break;
        case 'seek-relative':
          if (current.hasTrack) current.seek(clamp(current.currentTime + command.seconds, 0, current.duration));
          else handled = false;
          break;
        case 'track-relative':
          if (!current.hasTrack) handled = false;
          else if (command.direction < 0) current.previous();
          else current.next();
          break;
        case 'volume-relative':
          current.setVolume(clamp(current.volume + command.amount, 0, 1));
          break;
        case 'toggle-immersive':
          if (current.hasTrack || current.immersiveMode) current.setImmersiveMode(!current.immersiveMode);
          else handled = false;
          break;
        case 'toggle-lyrics':
          current.toggleLyrics();
          break;
        case 'toggle-eq':
          current.toggleEq();
          break;
        case 'toggle-mute':
          current.setVolume(current.volume > 0.001 ? 0 : lastNonZeroVolume.current);
          break;
        case 'escape':
          if (current.immersiveMode) current.setImmersiveMode(false);
          else if (current.showBatchTag) current.closeBatchTag();
          else if (current.showLyrics) current.toggleLyrics();
          else if (current.showEq) current.toggleEq();
          else handled = false;
          break;
      }

      if (handled) event.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
