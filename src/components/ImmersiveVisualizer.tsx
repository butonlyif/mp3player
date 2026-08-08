import { useEffect, useRef, type CSSProperties } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { AudioReactiveAnalyzer, MoodEngine } from '../audio/reactiveAnalysis';
import { ParticleField } from '../visualizer/ParticleField';
import { extractCoverPalette, fallbackPalette } from '../visualizer/palette';

interface ImmersiveVisualizerProps {
  trackKey: string;
  title: string;
  artist: string | null;
  lyric: string | null;
  coverArt: string | null;
  isPlaying: boolean;
  motionEnabled: boolean;
  onExit: () => void;
  onMotionChange: (enabled: boolean) => void;
}

type VisualStyle = CSSProperties & Record<`--liquid-${string}`, string>;

export default function ImmersiveVisualizer({
  trackKey, title, artist, lyric, coverArt, isPlaying, motionEnabled, onExit, onMotionChange,
}: ImmersiveVisualizerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let current = true;
    const fallback = fallbackPalette(trackKey);
    const apply = (colors: [string, string, string]) => {
      if (!current || !rootRef.current) return;
      colors.forEach((color, index) => rootRef.current!.style.setProperty(`--liquid-color-${index + 1}`, color));
    };
    apply(fallback.colors);
    if (coverArt) extractCoverPalette(coverArt, trackKey).then((palette) => apply(palette.colors)).catch(() => apply(fallback.colors));
    return () => { current = false; };
  }, [coverArt, trackKey]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || !motionEnabled) return;

    const field = new ParticleField(canvas);
    const analyzer = new AudioReactiveAnalyzer(audioEngine.frequencyBinCount);
    const moodEngine = new MoodEngine();
    const frequencyData = new Uint8Array(new ArrayBuffer(audioEngine.frequencyBinCount));
    const resize = () => field.resize(root.clientWidth, root.clientHeight, window.devicePixelRatio);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(root);
    resize();

    let frameId = 0;
    let lastSample = 0;
    let hidden = document.hidden;
    const stopAt = isPlaying ? Infinity : performance.now() + 800;
    const onVisibility = () => { hidden = document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      if (hidden || now - lastSample < 33 || now > stopAt) return;
      const dt = lastSample ? now - lastSample : 33;
      lastSample = now;
      if (!audioEngine.getFrequencyData(frequencyData)) return;
      const signal = analyzer.update(frequencyData, now);
      const mood = moodEngine.update(signal, dt);
      root.style.setProperty('--liquid-energy', signal.energy.toFixed(3));
      root.style.setProperty('--liquid-bass', signal.bass.toFixed(3));
      root.style.setProperty('--liquid-mid', signal.mid.toFixed(3));
      root.dataset.mood = mood.dominant;
      field.render(signal, mood, dt);
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      field.destroy();
    };
  }, [isPlaying, motionEnabled, trackKey]);

  const style: VisualStyle = {
    '--liquid-color-1': 'rgb(91 67 175)',
    '--liquid-color-2': 'rgb(180 78 139)',
    '--liquid-color-3': 'rgb(38 128 132)',
    '--liquid-energy': '0', '--liquid-bass': '0', '--liquid-mid': '0',
  };

  return (
    <section
      ref={rootRef}
      className={`liquid-memory ${isPlaying ? 'is-playing' : 'is-paused'} ${motionEnabled ? '' : 'motion-off'}`}
      aria-label="沉浸式音乐视觉"
      style={style}
    >
      <div className="liquid-cover-texture" style={coverArt ? { backgroundImage: `url(${coverArt})` } : undefined} />
      <div className="liquid-fog liquid-fog-one" />
      <div className="liquid-fog liquid-fog-two" />
      <div className="liquid-fog liquid-fog-three" />
      {motionEnabled && <canvas ref={canvasRef} className="liquid-particles" data-testid="liquid-particles" aria-hidden="true" />}

      <div className="liquid-toolbar">
        <label className="liquid-motion-toggle">
          <input
            type="checkbox"
            role="switch"
            aria-label="动态效果"
            checked={motionEnabled}
            onChange={(event) => onMotionChange(event.target.checked)}
          />
          <span>动态</span>
        </label>
        <button className="icon-btn liquid-exit" aria-label="退出沉浸模式" onClick={onExit}>×</button>
      </div>

      <div className="liquid-metadata">
        <span className="liquid-kicker">LIQUID MEMORY</span>
        <h1>{title}</h1>
        {artist && <p className="liquid-artist">{artist}</p>}
        {lyric && <p className="liquid-lyric">{lyric}</p>}
      </div>
    </section>
  );
}
