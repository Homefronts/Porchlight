import { describe, expect, it, vi } from "vitest";
import {
  CLASSIC_LIGHT_SEEDS,
  baseOf,
  commitDraft,
  editLook,
  lowContrast,
  paletteInUse,
} from "./edit";
import { BUILT_IN_LOOKS } from "./looks";

const { sleeve, classic } = BUILT_IN_LOOKS;

describe("editLook", () => {
  it("turns a built-in into an unsaved draft named after its base", () => {
    const d = editLook(sleeve, { seeds: { ...sleeve.seeds, acc: "#00ff00" } });
    expect(d).toMatchObject({ id: "", name: "Sleeve, edited", base: "sleeve" });
    expect(d.seeds.acc).toBe("#00ff00");
    expect(BUILT_IN_LOOKS.sleeve.seeds.acc).toBe("#ff3b5c");
  });

  it("keeps a custom look's id and name", () => {
    const mine = { ...sleeve, id: "custom-1", name: "Mine" };
    expect(editLook(mine, { radius: { window: 0, cover: 0, button: 0 } }))
      .toMatchObject({ id: "custom-1", name: "Mine" });
  });

  it("edits Classic from the palette in use and keeps that mode", () => {
    const d = editLook(paletteInUse(classic, "light"), {});
    expect(d).toMatchObject({ name: "Classic, edited", mode: "light", seeds: CLASSIC_LIGHT_SEEDS });
    expect(paletteInUse(classic, "dark")).toBe(classic);
  });
});

describe("baseOf", () => {
  it("is the built-in in the look's own mode, for default / reset", () => {
    const light = { ...classic, id: "custom-2", mode: "light" as const };
    expect(baseOf(light).seeds).toEqual(CLASSIC_LIGHT_SEEDS);
    expect(baseOf({ ...sleeve, id: "custom-3" })).toBe(sleeve);
  });
});

describe("lowContrast", () => {
  it("flags text under 3:1 on the background", () => {
    expect(lowContrast(sleeve.seeds)).toBe(false);
    expect(lowContrast({ ...sleeve.seeds, fg: "#2a2622" })).toBe(true);
    // #949494 on white is about 3.03:1.
    expect(lowContrast({ ...sleeve.seeds, bg: "#ffffff", fg: "#949494" })).toBe(false);
    expect(lowContrast({ ...sleeve.seeds, bg: "#ffffff", fg: "#969696" })).toBe(true);
  });
});

describe("commitDraft", () => {
  const fakeStore = (custom: typeof sleeve[] = []) => {
    const s = {
      custom,
      saveCustom: vi.fn((l: typeof sleeve) => {
        const id = l.id || `custom-${s.custom.length + 1}`;
        s.custom = s.custom.some((c) => c.id === id)
          ? s.custom.map((c) => (c.id === id ? { ...l, id } : c))
          : [...s.custom, { ...l, id }];
        return id;
      }),
    };
    return s;
  };

  it("saves a new draft as one custom look", () => {
    const s = fakeStore();
    const id = commitDraft(editLook(sleeve, { mode: "dark" }), s);
    expect(id).toBe("custom-1");
    expect(s.custom.map((c) => c.name)).toEqual(["Sleeve, edited"]);
  });

  it("updates an edited custom look in place", () => {
    const mine = { ...sleeve, id: "custom-9", name: "Mine" };
    const s = fakeStore([mine]);
    const edited = editLook(mine, { seeds: { ...mine.seeds, acc: "#00ff00" } });
    expect(commitDraft(edited, s)).toBe("custom-9");
    expect(s.custom).toHaveLength(1);
    expect(s.custom[0].seeds.acc).toBe("#00ff00");
  });

  it("writes nothing when nothing changed", () => {
    const mine = { ...sleeve, id: "custom-9", name: "Mine" };
    const s = fakeStore([mine]);
    expect(commitDraft({ ...mine }, s)).toBe("custom-9");
    expect(commitDraft(sleeve, s)).toBe("sleeve");
    expect(s.saveCustom).not.toHaveBeenCalled();
  });
});
