interface TrackSwitchEngine {
  crossfadeTo(url: string, seconds: number): Promise<boolean>;
  cancelCrossfade(): void;
  load(url: string): void;
  play(): void;
}

interface LoadTrackRequestOptions {
  trackId: number;
  urlPromise: Promise<string>;
  fadeSeconds: number | null;
  crossfadeEnabled: boolean | (() => boolean);
  engine: TrackSwitchEngine;
  signal?: AbortSignal;
  isCurrent(trackId: number): boolean;
  shouldPlay(): boolean;
}

/**
 * Resolves and switches one requested track without allowing an older async
 * request to resume playback after the selection has changed.
 */
export async function loadTrackRequest(options: LoadTrackRequestOptions): Promise<void> {
  const {
    trackId,
    urlPromise,
    fadeSeconds,
    crossfadeEnabled,
    engine,
    signal,
    isCurrent,
    shouldPlay,
  } = options;

  const url = await urlPromise;
  if (signal?.aborted || !isCurrent(trackId)) return;

  const canCrossfade = typeof crossfadeEnabled === 'function'
    ? crossfadeEnabled()
    : crossfadeEnabled;
  if (fadeSeconds && canCrossfade) {
    const cancelTransition = () => engine.cancelCrossfade();
    signal?.addEventListener('abort', cancelTransition, { once: true });
    let transitioned: boolean;
    try {
      transitioned = await engine.crossfadeTo(url, fadeSeconds);
    } finally {
      signal?.removeEventListener('abort', cancelTransition);
    }
    // The selected track may have changed while the crossfade was preloading
    // or ramping. Never let this obsolete request run its fallback load.
    if (signal?.aborted || !isCurrent(trackId)) return;
    if (transitioned) return;
  }

  if (signal?.aborted || !isCurrent(trackId)) return;
  engine.load(url);
  if (shouldPlay()) engine.play();
}
