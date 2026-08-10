import type { VisualPalette } from '../visualizer/palette';

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function parseRgb(color: string): RgbColor {
  const match = color.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\)$/);
  if (!match) throw new Error(`Invalid RGB color: ${color}`);
  return {
    red: clamp(Number(match[1]), 0, 255),
    green: clamp(Number(match[2]), 0, 255),
    blue: clamp(Number(match[3]), 0, 255),
  };
}

function rgbToHsl({ red, green, blue }: RgbColor): HslColor {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);

  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness };
}

function hslToRgb({ hue, saturation, lightness }: HslColor): RgbColor {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r, g, b] = segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
      : segment < 3 ? [0, chroma, x]
        : segment < 4 ? [0, x, chroma]
          : segment < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return { red: (r + match) * 255, green: (g + match) * 255, blue: (b + match) * 255 };
}

export function tuneMagicPillPalette(palette: VisualPalette): VisualPalette {
  return {
    colors: palette.colors.map((color, index) => {
      const hsl = rgbToHsl(parseRgb(color));
      const saturation = hsl.saturation === 0
        ? 0
        : clamp(hsl.saturation, index === 0 ? 0.48 : 0.38, 0.82);
      const lightness = clamp(
        hsl.lightness,
        index === 0 ? 0.58 : 0.28,
        index === 0 ? 0.72 : 0.58,
      );
      const result = hslToRgb({ hue: hsl.hue, saturation, lightness });
      return `rgb(${Math.round(result.red)} ${Math.round(result.green)} ${Math.round(result.blue)})`;
    }) as [string, string, string],
  };
}
