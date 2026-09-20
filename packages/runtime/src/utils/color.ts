/** Ported from `adjustBrightness`: drive lightness to a fixed percentage. */

const hexToHsl = (hex: string): [number, number, number] => {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  // Greys stay grey; everything else is pushed to a fixed saturation so the
  // derived shade reads as the same brand colour.
  const saturation = r === g && g === b ? 0 : 56;
  return [Math.round(h), saturation, Math.round(l * 100)];
};

const hslToHex = (h: number, s: number, l: number): string => {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const to255 = (value: number) => Math.round((value + m) * 255);
  return `#${((1 << 24) + (to255(r) << 16) + (to255(g) << 8) + to255(b)).toString(16).slice(1)}`;
};

export function adjustBrightness(hex: string, lightnessPercent: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, Math.max(0, lightnessPercent)));
}

/** Pick readable foreground text for a background colour. */
export function contrastColor(hex: string, dark = '#111111', light = '#ffffff'): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return light;
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? dark : light;
}
