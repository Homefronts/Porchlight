// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

import { parseThemeFile, toThemeFile } from "./file";
import { applyImport, dialTipOpen, layoutOfferText, nextLayout, shouldCycleOnKey } from "./layouts";
import { BUILT_IN_LOOKS } from "./looks";
import { useThemeStore } from "./store";

const key = (target: EventTarget | null, key = "l", ctrlKey = true) =>
  shouldCycleOnKey({ key, ctrlKey, metaKey: false, altKey: false, target });

describe("layouts", () => {
  it("cycles both ways and wraps", () => {
    expect(nextLayout("sidebar")).toBe("gatefold");
    expect(nextLayout("panels")).toBe("sidebar");
    expect(nextLayout("sidebar", -1)).toBe("panels");
  });

  it("Ctrl+L cycles, except while typing", () => {
    expect(key(document.body)).toBe(true);
    expect(key(document.body, "L")).toBe(true);
    expect(key(document.createElement("input"))).toBe(false);
    expect(key(document.createElement("textarea"))).toBe(false);
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "");
    const inner = div.appendChild(document.createElement("span"));
    expect(key(div)).toBe(false);
    expect(key(inner)).toBe(false);
    expect(key(document.body, "l", false)).toBe(false);
  });

  it("holds the dial tip until the picker is done and the dial is on screen", () => {
    const fresh = { pickerSeen: true, dialTipSeen: false };
    expect(dialTipOpen(fresh, true)).toBe(true);
    expect(dialTipOpen(fresh, false)).toBe(false);
    expect(dialTipOpen({ ...fresh, pickerSeen: false }, true)).toBe(false);
    expect(dialTipOpen({ ...fresh, dialTipSeen: true }, true)).toBe(false);
  });

  it("offers a file's layout by name", () => {
    expect(layoutOfferText("crate")).toBe("This look was made for Crate. Switch to Crate?");
  });

  it("importing a Crate look keeps Sidebar until the offer is taken", () => {
    useThemeStore.setState({ activeId: "classic", layout: "sidebar", custom: [] });
    const res = parseThemeFile(toThemeFile(BUILT_IN_LOOKS.paper, "crate"));
    if (!res.ok) throw new Error(res.error);
    expect(applyImport(res)).toBe("crate");
    const s = useThemeStore.getState();
    expect(s.layout).toBe("sidebar");
    s.setActive(s.custom[0].id);
    expect(useThemeStore.getState().layout).toBe("sidebar");
  });

  it("has nothing to offer when the file matches the current layout", () => {
    useThemeStore.setState({ layout: "crate", custom: [] });
    const res = parseThemeFile(toThemeFile(BUILT_IN_LOOKS.paper, "crate"));
    if (!res.ok) throw new Error(res.error);
    expect(applyImport(res)).toBeNull();
  });
});
