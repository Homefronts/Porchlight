import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILT_IN_LOOKS, type BuiltInId } from "./looks";
import { contrastRatio, deriveTokens } from "./tokens";

const nonClassic = (Object.keys(BUILT_IN_LOOKS) as BuiltInId[]).filter(
  (id) => id !== "classic",
);

describe("deriveTokens", () => {
  it("maps Sleeve's seeds onto the shadcn tokens", () => {
    const t = deriveTokens(BUILT_IN_LOOKS.sleeve);
    expect(t["--background"]).toBe("#0e0d0c");
    expect(t["--foreground"]).toBe("#ece6da");
    expect(t["--brand"]).toBe("#ff3b5c");
  });

  it("returns nothing for Classic, which is the stylesheet", () => {
    expect(deriveTokens(BUILT_IN_LOOKS.classic)).toEqual({});
  });

  it("covers every variable the .dark block declares", () => {
    const css = readFileSync("src/index.css", "utf8");
    const block = css.slice(css.indexOf("\n.dark {"));
    const dark = block.slice(0, block.indexOf("\n}"));
    const names = new Set(
      [...dark.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]),
    );
    expect(names.size).toBeGreaterThan(100);
    for (const id of nonClassic) {
      const t = deriveTokens(BUILT_IN_LOOKS[id]);
      expect([...names].filter((n) => !(n in t))).toEqual([]);
    }
  });

  it("keeps text readable in every built-in", () => {
    for (const id of nonClassic) {
      const { fg, dim, bg } = BUILT_IN_LOOKS[id].seeds;
      expect(contrastRatio(fg, bg), id).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(dim, bg), id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});
