// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { editLook } from "./edit";
import { continuePicker, isUpdater, skipPicker, skipsWelcome, welcomeCopy } from "./first-launch";
import { BUILT_IN_LOOKS } from "./looks";
import { useThemeStore } from "./store";

const start = (activeId: string) =>
  useThemeStore.setState({ activeId, layout: "sidebar", custom: [], pickerSeen: false });

describe("welcomeCopy", () => {
  it("tells updaters nothing changes yet, and fresh installs nothing extra", () => {
    expect(isUpdater("classic")).toBe(true);
    expect(isUpdater("sleeve")).toBe(false);
    expect(welcomeCopy(true).note).toBe(
      "Same library, same settings. Nothing changes until you pick a look.",
    );
    expect(welcomeCopy(false).note).toBeNull();
  });

  it("names the old app in the origin line now that the name has changed", () => {
    const c = welcomeCopy(true);
    expect(c.title).toBe("Welcome to Porchlight.");
    expect(c.tagline).toBe("YouTube Music, made yours.");
    expect(c.origin).toBe("FORMERLY YTUBIC PLUS · BUILT ON YTUBIC BY NUBER");
    expect(Object.values(c).join(" ")).not.toMatch(/[–—]/);
  });
});

describe("skipsWelcome", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey", boolean>> = {}) =>
    skipsWelcome({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it("skips on ordinary keys", () => {
    for (const k of ["a", "Enter", " ", "Escape", "ArrowDown"]) expect(key(k)).toBe(true);
  });

  it("ignores focus, modifier, screen-reader and function keys, and shortcuts", () => {
    for (const k of ["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock", "Insert", "F1", "F12"]) {
      expect(key(k)).toBe(false);
    }
    expect(key("a", { ctrlKey: true })).toBe(false);
    expect(key("a", { metaKey: true })).toBe(false);
    expect(key("Tab", { altKey: true })).toBe(false);
  });
});

describe("leaving the picker", () => {
  beforeEach(() => start("classic"));

  it("Continue on the unedited preselected Classic changes nothing but pickerSeen", () => {
    continuePicker({ look: BUILT_IN_LOOKS.classic, layout: "sidebar" });
    expect(useThemeStore.getState()).toMatchObject({
      activeId: "classic",
      layout: "sidebar",
      custom: [],
      pickerSeen: true,
    });
  });

  it("Esc keeps the preselected look exactly and only marks the picker seen", () => {
    skipPicker();
    const s = useThemeStore.getState();
    expect(s).toMatchObject({ activeId: "classic", layout: "sidebar", custom: [], pickerSeen: true });
  });

  it("Continue on a built-in switches to it without saving anything", () => {
    continuePicker({ look: BUILT_IN_LOOKS.paper, layout: "sidebar" });
    expect(useThemeStore.getState()).toMatchObject({ activeId: "paper", custom: [], pickerSeen: true });
  });

  it("Continue on an edited draft saves it, uses it and saves the Sidebar layout", () => {
    const draft = editLook(BUILT_IN_LOOKS.sleeve, {
      seeds: { ...BUILT_IN_LOOKS.sleeve.seeds, acc: "#00ff00" },
    });
    continuePicker({ look: draft, layout: "gatefold" });
    const s = useThemeStore.getState();
    expect(s.custom).toHaveLength(1);
    expect(s.activeId).toBe(s.custom[0].id);
    expect(s.custom[0].seeds.acc).toBe("#00ff00");
    expect(s).toMatchObject({ layout: "sidebar", pickerSeen: true });
  });
});
