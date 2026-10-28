import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILT_IN_LOOKS, isLinerLook, type BuiltInId } from "./looks";
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

describe("typography roles", () => {
  it("gives each look its own role fonts", () => {
    expect(deriveTokens(BUILT_IN_LOOKS.sleeve)["--font-headline"]).toContain("Instrument Serif");
    expect(deriveTokens(BUILT_IN_LOOKS.ink)["--font-headline"]).toContain("Inter");
  });

  it("registers the role utilities with Classic fallbacks, and ships the faces", () => {
    const css = readFileSync("src/index.css", "utf8");
    for (const r of ["headline", "display", "meta"]) {
      expect(css).toContain(`--font-${r}: var(--font-${r}, var(--app-font));`);
    }
    expect(css).toContain('[data-touch-uppercase="on"]');
    const ts = readFileSync("src/lib/interface-font.ts", "utf8");
    for (const pkg of ["@fontsource/instrument-serif", "@fontsource-variable/archivo", "@fontsource-variable/jetbrains-mono"]) {
      expect(ts).toContain(`import "${pkg}"`);
    }
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});

describe("isLinerLook", () => {
  it("is true for the Liner bases only", () => {
    expect(nonClassic.filter((id) => isLinerLook(BUILT_IN_LOOKS[id]))).toEqual([
      "sleeve",
      "paper",
      "ink-liner",
    ]);
  });
});
