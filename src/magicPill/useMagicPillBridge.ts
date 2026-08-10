import { useCallback, useEffect, useRef } from 'react';
import type { MagicPillController } from './controller';
import type { MagicPillSnapshot } from './protocol';

export interface MagicPillPlaybackActions {
  previous(): void;
  togglePlayback(): void;
  next(): void;
}

export interface UseMagicPillBridgeInput {
  controller: MagicPillController;
  trackId: number | null;
  title: string;
  artist: string;
  isPlaying: boolean;
  palette: [string, string, string];
  actions: MagicPillPlaybackActions;
}

interface SnapshotFields {
  trackId: number | null;
  title: string;
  artist: string;
  isPlaying: boolean;
  palette: [string, string, string];
}

function sameSnapshotFields(snapshot: MagicPillSnapshot, fields: SnapshotFields): boolean {
  return snapshot.trackId === fields.trackId
    && snapshot.title === fields.title
    && snapshot.artist === fields.artist
    && snapshot.isPlaying === fields.isPlaying
    && snapshot.palette.every((color, index) => color === fields.palette[index]);
}

export function useMagicPillBridge({
  controller,
  trackId,
  title,
  artist,
  isPlaying,
  palette,
  actions,
}: UseMagicPillBridgeInput) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const revisionRef = useRef(0);
  const snapshotRef = useRef<MagicPillSnapshot | null>(null);
  const fields = { trackId, title, artist, isPlaying, palette };

  if (!snapshotRef.current || !sameSnapshotFields(snapshotRef.current, fields)) {
    revisionRef.current += 1;
    snapshotRef.current = {
      version: 1,
      revision: revisionRef.current,
      trackId,
      title,
      artist,
      isPlaying,
      palette: [...palette],
    };
  }
  const snapshot = snapshotRef.current;

  useEffect(() => {
    controller.setCommandHandler((command) => {
      if (command.type === 'previous') actionsRef.current.previous();
      else if (command.type === 'toggle-playback') actionsRef.current.togglePlayback();
      else if (command.type === 'next') actionsRef.current.next();
      else void controller.restore();
    });
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    void controller.publish(snapshot);
  }, [controller, snapshot]);

  const enterMagicPill = useCallback(
    () => controller.enter(snapshot),
    [controller, snapshot],
  );

  return { enterMagicPill };
}
