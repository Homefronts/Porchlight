// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  });
});
import { softLimit } from "./echo-visualizer";

it("never lets a swing reach the limit, however loud, and leaves quiet ones alone", () => {
  for (const swing of [79, 200, 5000, -5000]) expect(Math.abs(softLimit(swing, 79))).toBeLessThanOrEqual(79);
  expect(softLimit(5, 79)).toBeCloseTo(5, 0);
  expect(softLimit(-30, 79)).toBeCloseTo(-softLimit(30, 79));
});
