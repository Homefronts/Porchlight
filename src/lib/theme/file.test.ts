import { describe, expect, it } from "vitest";
import { parseThemeFile, toThemeFile } from "./file";
import { BUILT_IN_LOOKS } from "./looks";

const sleeve = BUILT_IN_LOOKS.sleeve;
const make = (patch: (f: any) => void, layout: any = "sidebar") => {
  const f = JSON.parse(toThemeFile(sleeve, layout));
  patch(f);
  return JSON.stringify(f);
};

describe("theme file", () => {
  it("round trips", () => {
    const r = parseThemeFile(toThemeFile(sleeve, "sidebar"));
    if (!r.ok) throw new Error(r.error);
    expect(r.look.seeds).toEqual(sleeve.seeds);
    expect(r.look.fonts).toEqual(sleeve.fonts);
    expect(r.look.radius).toEqual(sleeve.radius);
    expect(r.look.touches).toEqual(sleeve.touches);
    expect(r.layout).toBe("sidebar");
    expect(r.notes).toEqual([]);
  });

  it("rejects CSS injection in a colour", () => {
    const r = parseThemeFile(
      make((f) => (f.look.seeds.bg = "red; background:url(http://x)")),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.look.seeds.bg).toBe(sleeve.seeds.bg);
    expect(r.notes.length).toBe(1);
  });

  it("expands #rgb to lower-case #rrggbb", () => {
    const r = parseThemeFile(make((f) => (f.look.seeds.acc = "#ABC")));
    if (!r.ok) throw new Error(r.error);
    expect(r.look.seeds.acc).toBe("#aabbcc");
  });

  it("fails cleanly on bad input", () => {
    for (const t of ["x".repeat(1_000_001), "{nope", "{}"]) {
      const r = parseThemeFile(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).not.toContain("\n");
    }
  });

  it("asks to update for a newer version", () => {
    const r = parseThemeFile(make((f) => (f.ytubicPlusTheme = 2)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/update the app/i);
  });

  it.each(["gatefold", "index", "crate", "panels"])(
    "maps unbuilt layout %s to sidebar with a note",
    (l) => {
      const r = parseThemeFile(make(() => {}, l));
      if (!r.ok) throw new Error(r.error);
      expect(r.layout).toBe("sidebar");
      expect(r.notes).toContain(
        `This look was made for the ${l[0].toUpperCase()}${l.slice(1)} layout, which arrives in a later update.`,
      );
    },
  );

  it("cleans the name, clamps radius, ignores unknown keys", () => {
    const r = parseThemeFile(
      make((f) => {
        f.name = "a\u0000" + "b".repeat(100);
        f.look.radius.window = 999;
        f.look.evil = "<script>";
        f.extra = 1;
      }),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.look.name).toHaveLength(60);
    expect(r.look.name).not.toContain("\u0000");
    expect(r.look.radius.window).toBe(24);
    expect(r.look).not.toHaveProperty("evil");
  });

  it("falls back for an unknown base and an empty name", () => {
    const r = parseThemeFile(
      make((f) => {
        f.name = "  ";
        f.look.name = "";
        f.look.base = "nope";
      }),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.look.base).toBe("sleeve");
    expect(r.look.name).toBe("Sleeve copy");
  });
});
