type HSL = [number, number, number];

function toHsl(r: number, g: number, b: number): HSL {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === x ? ((y - z) / d + 6) % 6 : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}

/**
 * The cover's most present colourful hue, from RGBA pixels, lifted (or, on a
 * light screen, deepened) so it reads as a thin line. A black-and-white cover
 * has no hue to use, so it gets a soft neutral.
 */
export function pickCoverColour(pixels: ArrayLike<number>, light: boolean): string {
  const buckets = new Array<number>(12).fill(0);
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [h, s, l] = toHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    buckets[Math.floor(h / 30) % 12] += s;
  }
  const best = buckets.indexOf(Math.max(...buckets));
  if (buckets[best] === 0) return light ? "hsl(0 0% 30%)" : "hsl(0 0% 82%)";
  return `hsl(${best * 30 + 15} 75% ${light ? 36 : 66}%)`;
}
