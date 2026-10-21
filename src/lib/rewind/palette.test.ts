import { describe, expect, it } from "vitest";
import { contrast, paletteFromPixels } from "./palette";

function image(colors: [number, number, number][], each = 100): Uint8ClampedArray {
  const px = new Uint8ClampedArray(colors.length * each * 4);
  colors.forEach(([r, g, b], c) => {
    for (let i = 0; i < each; i++) px.set([r, g, b, 255], (c * each + i) * 4);
  });
  return px;
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("paletteFromPixels", () => {
  it("takes a blue background from a mostly blue cover and a readable accent", () => {
    const p = paletteFromPixels(image([[20, 60, 200], [20, 60, 200], [20, 60, 200], [250, 200, 40]]));
    const [r, g, b] = rgb(p.bg[0]);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(contrast(p.accent, p.bg[2])).toBeGreaterThanOrEqual(3);
  });
  it("colours a mostly black cover from its colourful part, bright like the mockup", () => {
    const p = paletteFromPixels(image([...Array(9).fill([8, 8, 8]), [200, 40, 60]]));
    const [r, g, b] = rgb(p.bg[0]);
    expect(r).toBeGreaterThan(150);
    expect(r).toBeGreaterThan(g + 80);
    expect(r).toBeGreaterThan(b + 80);
    // The middle of the slide is still a colour, not black.
    expect(Math.max(...rgb(p.bg[1]))).toBeGreaterThan(80);
  });
  it("falls back to a white accent on a grey cover", () => {
    expect(paletteFromPixels(image([[128, 128, 128]])).accent).toBe("#ffffff");
  });
});
