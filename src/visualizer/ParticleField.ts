import type { MoodSnapshot, ReactiveSnapshot } from '../audio/reactiveAnalysis';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  tail: number;
}

export class ParticlePool {
  private readonly particles: Particle[];
  private spawnCooldownMs = 0;

  constructor(limit = 36, private readonly random = Math.random) {
    this.particles = Array.from({ length: Math.max(0, limit) }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 1, tail: 20,
    }));
  }

  get activeCount(): number {
    let count = 0;
    for (const particle of this.particles) if (particle.active) count += 1;
    return count;
  }

  update(treble: number, beat: number, dtMs: number, width: number, height: number): void {
    this.spawnCooldownMs = Math.max(0, this.spawnCooldownMs - dtMs);
    const trebleMeteor = treble > 0.28 && this.spawnCooldownMs === 0;
    const spawnCount = beat > 0 ? 6 : trebleMeteor ? 1 : 0;
    for (let index = 0; index < spawnCount; index += 1) this.spawn(width, height, treble);
    if (spawnCount > 0) this.spawnCooldownMs = beat > 0 ? 120 : 190;
    const dt = Math.min(50, Math.max(0, dtMs)) / 1_000;
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy -= 4 * dt;
      particle.life -= dt * 0.72;
      if (particle.life <= 0) particle.active = false;
    }
  }

  forEachActive(visitor: (particle: Readonly<Particle>) => void): void {
    for (const particle of this.particles) if (particle.active) visitor(particle);
  }

  clear(): void {
    for (const particle of this.particles) particle.active = false;
  }

  private spawn(width: number, height: number, treble: number): void {
    const particle = this.particles.find((item) => !item.active);
    if (!particle) return;
    const angle = 2.24 + (this.random() - 0.5) * 0.52;
    const speed = 100 + this.random() * (120 + treble * 100);
    particle.active = true;
    particle.x = width * (0.58 + this.random() * 0.38);
    particle.y = height * (0.04 + this.random() * 0.42);
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
    particle.life = 0.72 + this.random() * 0.58;
    particle.size = 1.1 + this.random() * 1.9;
    particle.tail = 22 + this.random() * (34 + treble * 34);
  }
}

export class ParticleField {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly pool = new ParticlePool(36);
  private width = 0;
  private height = 0;
  private ringLife = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d');
  }

  resize(width: number, height: number, dpr: number): void {
    const ratio = Math.min(1.5, Math.max(1, dpr || 1));
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  render(signal: ReactiveSnapshot, mood: MoodSnapshot, dtMs: number): void {
    if (!this.context) return;
    if (signal.beat) this.ringLife = 1;
    this.pool.update(signal.treble, signal.beat, dtMs, this.width, this.height);
    this.context.clearRect(0, 0, this.width, this.height);
    const weights = mood.weights;
    const red = 190 * weights.calm + 255 * weights.warm + 154 * weights.melancholic + 190 * weights.energetic;
    const green = 210 * weights.calm + 190 * weights.warm + 170 * weights.melancholic + 245 * weights.energetic;
    const blue = 255 * weights.calm + 145 * weights.warm + 235 * weights.melancholic + 238 * weights.energetic;
    const hue = `${Math.round(red)} ${Math.round(green)} ${Math.round(blue)}`;
    this.context.fillStyle = `rgb(${hue})`;
    this.context.strokeStyle = `rgb(${hue})`;
    this.context.lineCap = 'round';
    this.context.shadowColor = `rgb(${hue})`;
    this.context.shadowBlur = 4;
    this.pool.forEachActive((particle) => {
      this.context!.globalAlpha = Math.max(0, particle.life) * (0.5 + weights.energetic * 0.3);
      const speed = Math.hypot(particle.vx, particle.vy) || 1;
      const tailX = particle.x - (particle.vx / speed) * particle.tail;
      const tailY = particle.y - (particle.vy / speed) * particle.tail;
      this.context!.lineWidth = Math.max(0.8, particle.size * 0.72);
      this.context!.beginPath();
      this.context!.moveTo(tailX, tailY);
      this.context!.lineTo(particle.x, particle.y);
      this.context!.stroke();
      this.context!.beginPath();
      this.context!.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.context!.fill();
    });
    if (this.ringLife > 0) {
      this.context.shadowBlur = 0;
      this.context.globalAlpha = this.ringLife * 0.42;
      this.context.strokeStyle = `rgb(${hue})`;
      this.context.lineWidth = 1.6;
      this.context.beginPath();
      this.context.arc(this.width / 2, this.height / 2, (1 - this.ringLife) * Math.min(this.width, this.height) * 0.38, 0, Math.PI * 2);
      this.context.stroke();
      this.ringLife = Math.max(0, this.ringLife - dtMs / 720);
    }
    this.context.shadowBlur = 0;
    this.context.globalAlpha = 1;
  }

  clear(): void {
    this.pool.clear();
    this.ringLife = 0;
    this.context?.clearRect(0, 0, this.width, this.height);
  }

  destroy(): void {
    this.clear();
  }
}
