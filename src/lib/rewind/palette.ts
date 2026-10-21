import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Palette } from "./types";

type Rgb = [number, number, number];

const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const unhex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(unhex(a)), luminance(unhex(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const saturation = ([r, g, b]: Rgb) => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

const WHITE: Rgb = [255, 255, 255];

function hueSat([r, g, b]: Rgb): [number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  if (!d) return [0, 0];
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, d / (1 - Math.abs(max + max - d - 1))];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  }) as Rgb;
}

/** Lightness of the mockup's ramp: bright behind the cover, near-black under the text. */
const RAMP = [0.5, 0.27, 0.08];

/** Background ramp from the cover's main colour, plus a readable accent. */
export function paletteFromPixels(rgba: Uint8ClampedArray): Palette {
  // 4 bits a channel: coarse enough to merge noise, fine enough to keep hues apart.
  const buckets = new Map<number, { n: number; sum: Rgb }>();
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] };
    b.n++;
    b.sum[0] += rgba[i];
    b.sum[1] += rgba[i + 1];
    b.sum[2] += rgba[i + 2];
    buckets.set(key, b);
    total++;
  }
  const colours = [...buckets.values()]
    .map((b) => ({ n: b.n, c: b.sum.map((v) => v / b.n) as Rgb }))
    .sort((a, b) => b.n - a.n);
  const colourful = colours.filter((x) => x.n >= total * 0.02 && saturation(x.c) >= 0.25);
  const vividness = (x: { c: Rgb }) => saturation(x.c) * Math.max(...x.c);
  // Background: the colour that fills the most of the cover, counting only colourful
  // pixels (album art is often mostly black or white). A grey cover stays grey.
  const base = [...colourful].sort((a, b) => b.n * vividness(b) - a.n * vividness(a))[0];
  const [h, s] = hueSat(base?.c ?? colours[0]?.c ?? [40, 40, 40]);
  const sat = base ? Math.min(Math.max(s, 0.55), 0.8) : s;
  const bg = RAMP.map((l) => hex(fromHsl(h, sat, l))) as Palette["bg"];

  // Accent: the most vivid colour with a real share of the image.
  const vivid = [...colourful].sort((a, b) => vividness(b) - vividness(a))[0];
  if (!vivid) return { bg, accent: "#ffffff" };
  let accent = vivid.c;
  for (let t = 0.15; contrast(hex(accent), bg[2]) < 3 && t <= 1; t += 0.15) accent = mix(vivid.c, WHITE, t);
  return { bg, accent: contrast(hex(accent), bg[2]) >= 3 ? hex(accent) : "#ffffff" };
}

const blobs = new Map<string, Promise<string | null>>();

/**
 * The cover as a blob: URL. Fetched through plugin-http (Rust side), so the
 * image is same-origin and canvas / save-as-image can read it.
 */
export function coverBlobUrl(url: string): Promise<string | null> {
  let p = blobs.get(url);
  if (!p) {
    p = tauriFetch(url)
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    blobs.set(url, p);
  }
  return p;
}

export async function readPalette(url: string): Promise<Palette | null> {
  const src = await coverBlobUrl(url);
  if (!src) return null;
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 32, 32);
  return paletteFromPixels(ctx.getImageData(0, 0, 32, 32).data);
}
