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
  const fieldRef = useRef<ParticleField | null>(null);
  const analyzerRef = useRef<AudioReactiveAnalyzer | null>(null);
  const moodRef = useRef<MoodEngine | null>(null);
  const frequencyRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const canvasErrorLogged = useRef(false);

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
    let field: ParticleField;
    try {
      field = new ParticleField(canvas);
      fieldRef.current = field;
    } catch (error) {
      if (!canvasErrorLogged.current) console.warn('粒子效果不可用，色雾将继续显示:', error);
      canvasErrorLogged.current = true;
      return;
    }
    const resize = () => field.resize(root.clientWidth, root.clientHeight, window.devicePixelRatio);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(root);
    resize();

    return () => {
      observer?.disconnect();
      field.destroy();
      if (fieldRef.current === field) fieldRef.current = null;
    };
  }, [motionEnabled]);

  useEffect(() => {
    analyzerRef.current = new AudioReactiveAnalyzer(
      audioEngine.frequencyBinCount, audioEngine.sampleRate, audioEngine.analyserFftSize,
    );
    moodRef.current = new MoodEngine();
    frequencyRef.current = new Uint8Array(new ArrayBuffer(audioEngine.frequencyBinCount));
  }, [trackKey]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionEnabled || !analyzerRef.current || !moodRef.current || !frequencyRef.current) return;
    let frameId = 0;
    let lastSample = 0;
    const stopAt = isPlaying ? Infinity : performance.now() + 800;
    let active = true;

    const frame = (now: number) => {
      if (!active || document.hidden || now > stopAt) {
        if (now > stopAt) {
          root.style.setProperty('--liquid-energy', '0');
          root.style.setProperty('--liquid-bass', '0');
          root.style.setProperty('--liquid-mid', '0');
          root.style.setProperty('--liquid-scale', '1');
          root.style.setProperty('--liquid-cover-opacity', '0.1');
          root.style.setProperty('--liquid-fog-opacity', '0.3');
          fieldRef.current?.clear();
        }
        return;
      }
      if (now - lastSample < 33) {
        frameId = requestAnimationFrame(frame);
        return;
      }
      const dt = lastSample ? now - lastSample : 33;
      lastSample = now;
      const frequencyData = frequencyRef.current!;
      if (isPlaying && !audioEngine.getFrequencyData(frequencyData)) {
        if (audioEngine.analysisState === 'unavailable') {
          root.classList.add('analysis-unavailable');
          fieldRef.current?.clear();
          return;
        }
        frameId = requestAnimationFrame(frame);
        return;
      } else if (!isPlaying) {
        frequencyData.fill(0);
      }
      const signal = analyzerRef.current!.update(frequencyData, now);
      const mood = moodRef.current!.update(signal, dt);
      root.style.setProperty('--liquid-energy', signal.energy.toFixed(3));
      root.style.setProperty('--liquid-bass', signal.bass.toFixed(3));
      root.style.setProperty('--liquid-mid', signal.mid.toFixed(3));
      root.style.setProperty('--liquid-calm', mood.weights.calm.toFixed(3));
      root.style.setProperty('--liquid-warm', mood.weights.warm.toFixed(3));
      root.style.setProperty('--liquid-melancholic', mood.weights.melancholic.toFixed(3));
      root.style.setProperty('--liquid-energetic', mood.weights.energetic.toFixed(3));
      root.style.setProperty('--liquid-fog-opacity', (0.3 + signal.energy * 0.22 + mood.weights.energetic * 0.08).toFixed(3));
      root.style.setProperty('--liquid-cover-opacity', (0.1 + signal.energy * 0.08).toFixed(3));
      root.style.setProperty('--liquid-scale', (1 + signal.bass * 0.012).toFixed(4));
      root.style.setProperty('--liquid-warm-glow', (mood.weights.warm * 0.34).toFixed(3));
      root.style.setProperty('--liquid-energetic-glow', (mood.weights.energetic * 0.35).toFixed(3));
      root.style.setProperty('--liquid-blue-glow', ((mood.weights.calm + mood.weights.melancholic) * 0.24).toFixed(3));
      try {
        fieldRef.current?.render(signal, mood, dt);
      } catch (error) {
        fieldRef.current?.destroy();
        fieldRef.current = null;
        if (!canvasErrorLogged.current) console.warn('粒子渲染已停用，色雾将继续显示:', error);
        canvasErrorLogged.current = true;
      }
      frameId = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frameId);
      if (!document.hidden && active) {
        lastSample = 0;
        frameId = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) frameId = requestAnimationFrame(frame);
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibility);
      root.classList.remove('analysis-unavailable');
    };
  }, [isPlaying, motionEnabled, trackKey]);

  const style: VisualStyle = {
    '--liquid-color-1': 'rgb(91 67 175)',
    '--liquid-color-2': 'rgb(180 78 139)',
    '--liquid-color-3': 'rgb(38 128 132)',
    '--liquid-energy': '0', '--liquid-bass': '0', '--liquid-mid': '0',
    '--liquid-calm': '1', '--liquid-warm': '0', '--liquid-melancholic': '0', '--liquid-energetic': '0',
    '--liquid-fog-opacity': '0.3', '--liquid-cover-opacity': '0.1', '--liquid-scale': '1',
    '--liquid-warm-glow': '0', '--liquid-energetic-glow': '0', '--liquid-blue-glow': '0.24',
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
