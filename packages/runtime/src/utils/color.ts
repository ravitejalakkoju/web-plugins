/** Pick readable foreground text for a background colour. */
export function contrastColor(hex: string, dark = '#111111', light = '#ffffff'): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return light;
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? dark : light;
}
