const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export function adaptiveCrossfadeSeconds(tailEnergy: number): number {
  return 4 - clamp01(tailEnergy) * 3;
}

export function sectionIntensity(progress: number, energy: number): number {
  const p = clamp01(progress);
  const intro = 0.6 + smoothstep(0, 0.16, p) * 0.4;
  const peakWindow = smoothstep(0.5, 0.62, p) * (1 - smoothstep(0.78, 0.88, p));
  const outro = 1 - smoothstep(0.88, 1, p) * 0.45;
  const energyTrim = 0.92 + clamp01(energy) * 0.16;
  return Math.min(1.7, intro * (1 + peakWindow * 0.65) * outro * energyTrim);
}
