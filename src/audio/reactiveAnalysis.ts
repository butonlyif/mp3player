export interface ReactiveSnapshot {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beat: number;
}

export type MoodName = 'calm' | 'warm' | 'melancholic' | 'energetic';

export interface MoodSnapshot {
  dominant: MoodName;
  weights: Record<MoodName, number>;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function average(data: Uint8Array, start: number, end: number): number {
  let sum = 0;
  const safeEnd = Math.min(data.length, Math.max(start + 1, end));
  for (let index = start; index < safeEnd; index += 1) sum += data[index];
  return sum / ((safeEnd - start) * 255);
}

function smooth(current: number, target: number, attack: number, release: number): number {
  return current + (target - current) * (target > current ? attack : release);
}

export class AudioReactiveAnalyzer {
  private readonly snapshot: ReactiveSnapshot = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
  private bassBaseline = 0.04;
  private lastBeatAt = -Infinity;
  private readonly bassEnd: number;
  private readonly midEnd: number;

  constructor(binCount: number) {
    this.bassEnd = Math.max(1, Math.round(binCount * 0.125));
    this.midEnd = Math.max(this.bassEnd + 1, Math.round(binCount * 0.5));
  }

  update(data: Uint8Array, nowMs: number): ReactiveSnapshot {
    const bass = average(data, 0, this.bassEnd);
    const mid = average(data, this.bassEnd, this.midEnd);
    const treble = average(data, this.midEnd, data.length);
    const energy = bass * 0.42 + mid * 0.36 + treble * 0.22;

    this.snapshot.bass = smooth(this.snapshot.bass, bass, 0.58, 0.12);
    this.snapshot.mid = smooth(this.snapshot.mid, mid, 0.42, 0.1);
    this.snapshot.treble = smooth(this.snapshot.treble, treble, 0.48, 0.14);
    this.snapshot.energy = smooth(this.snapshot.energy, energy, 0.45, 0.09);

    const threshold = Math.max(0.12, this.bassBaseline * 1.65);
    const isBeat = bass > threshold && bass - this.bassBaseline > 0.1 && nowMs - this.lastBeatAt >= 240;
    this.snapshot.beat = isBeat ? 1 : 0;
    if (isBeat) this.lastBeatAt = nowMs;
    this.bassBaseline += (bass - this.bassBaseline) * (bass > this.bassBaseline ? 0.025 : 0.08);
    return this.snapshot;
  }
}

const MOODS: MoodName[] = ['calm', 'warm', 'melancholic', 'energetic'];

export class MoodEngine {
  private energy = 0;
  private brightness = 0;
  private beatDensity = 0;
  private readonly snapshot: MoodSnapshot = {
    dominant: 'calm',
    weights: { calm: 1, warm: 0, melancholic: 0, energetic: 0 },
  };

  update(signal: ReactiveSnapshot, dtMs: number): MoodSnapshot {
    const windowAlpha = 1 - Math.exp(-Math.max(0, dtMs) / 10_000);
    this.energy += (signal.energy - this.energy) * windowAlpha;
    this.brightness += (signal.treble - this.brightness) * windowAlpha;
    this.beatDensity += (signal.beat - this.beatDensity) * windowAlpha;

    // 长窗口保证情绪稳定，少量即时信号确保强烈段落能立即开始过渡。
    const perceivedEnergy = this.energy * 0.68 + signal.energy * 0.32;
    const perceivedBrightness = this.brightness * 0.72 + signal.treble * 0.28;
    const perceivedBeat = this.beatDensity * 0.75 + signal.beat * 0.25;
    const energetic = clamp01((perceivedEnergy - 0.3) * 2.5 + perceivedBeat * 1.7 + perceivedBrightness * 0.35);
    const calm = clamp01((0.38 - perceivedEnergy) * 2.6 + (0.24 - perceivedBeat));
    const melancholic = clamp01((0.34 - perceivedEnergy) * 1.45 + (0.25 - perceivedBrightness) * 1.2);
    const warm = clamp01(0.7 - Math.abs(perceivedEnergy - 0.38) * 1.65 - Math.abs(perceivedBrightness - 0.3));
    const raw = { calm, warm, melancholic, energetic };
    const total = MOODS.reduce((sum, mood) => sum + raw[mood], 0) || 1;
    const transition = 1 - Math.exp(-Math.max(0, dtMs) / 3_000);

    let normalizedTotal = 0;
    for (const mood of MOODS) {
      const target = raw[mood] / total;
      this.snapshot.weights[mood] += (target - this.snapshot.weights[mood]) * transition;
      normalizedTotal += this.snapshot.weights[mood];
    }
    for (const mood of MOODS) this.snapshot.weights[mood] /= normalizedTotal || 1;
    this.snapshot.dominant = MOODS.reduce((best, mood) =>
      this.snapshot.weights[mood] > this.snapshot.weights[best] ? mood : best,
    );
    return this.snapshot;
  }
}
