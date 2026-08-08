export interface VisualPalette {
  colors: [string, string, string];
}

const rgb = (red: number, green: number, blue: number) =>
  `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fallbackPalette(seed: string): VisualPalette {
  const hash = hashSeed(seed || 'peter-player');
  const hue = hash % 360;
  const color = (offset: number, saturation: number, lightness: number) => {
    const h = ((hue + offset) % 360) / 60;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((h % 2) - 1));
    const segment = Math.floor(h) % 6;
    const pairs = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
    const [r, g, b] = pairs[segment];
    const match = lightness - chroma / 2;
    return rgb((r + match) * 255, (g + match) * 255, (b + match) * 255);
  };
  return { colors: [color(0, 0.62, 0.48), color(58, 0.55, 0.42), color(210, 0.58, 0.38)] };
}

export function paletteFromPixels(pixels: Uint8ClampedArray, seed = 'cover'): VisualPalette {
  const chosen: Array<[number, number, number]> = [];
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 96) continue;
    const candidate: [number, number, number] = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const distinct = chosen.every(([r, g, b]) =>
      Math.abs(r - candidate[0]) + Math.abs(g - candidate[1]) + Math.abs(b - candidate[2]) > 90,
    );
    if (distinct) chosen.push(candidate);
    if (chosen.length === 3) break;
  }
  if (chosen.length === 0) return fallbackPalette(seed);
  while (chosen.length < 3) {
    const [r, g, b] = chosen[chosen.length - 1];
    const factor = chosen.length === 1 ? 0.72 : 1.2;
    chosen.push([Math.min(255, r * factor), Math.min(255, g * factor), Math.min(255, b * factor)]);
  }
  return { colors: [rgb(...chosen[0]), rgb(...chosen[1]), rgb(...chosen[2])] };
}

export function extractCoverPalette(src: string, seed = src): Promise<VisualPalette> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error('封面取色超时')), 4_000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      window.clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas 不可用');
        context.drawImage(image, 0, 0, 24, 24);
        resolve(paletteFromPixels(context.getImageData(0, 0, 24, 24).data, seed));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('封面加载失败'));
    };
    image.src = src;
  });
}
