// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
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

import { BUILT_IN_LOOKS, type Look } from "./looks";
import { activeLook, initialLookFor, useThemeStore } from "./store";
import { applyLook, applySavedLook } from "./apply";

beforeEach(() => useThemeStore.setState({ activeId: "classic", custom: [] }));

it("picks the first look from whether an install existed", () => {
  expect(initialLookFor(true)).toBe("classic");
  expect(initialLookFor(false)).toBe("sleeve");
});

it("falls back to classic for an unknown id", () => {
  expect(activeLook({ activeId: "nope", custom: [] }).id).toBe("classic");
});

it("deleting the active custom look returns to its base", () => {
  const s = useThemeStore.getState();
  const id = s.saveCustom({ ...BUILT_IN_LOOKS.paper, id: "x", name: "Mine" });
  s.setActive(id);
  useThemeStore.getState().deleteCustom(id);
  expect(useThemeStore.getState().activeId).toBe("paper");
  expect(useThemeStore.getState().custom).toEqual([]);
});

it("applies a look and Classic removes every trace", () => {
  const el = document.documentElement;
  applyLook(BUILT_IN_LOOKS.sleeve);
  expect(el.getAttribute("data-look")).toBe("sleeve");
  expect(el.getAttribute("data-touch-vinyl")).toBe("on");
  expect(el.getAttribute("data-touch-offset-shadows")).toBe("off");
  expect(el.style.getPropertyValue("--background")).toBe("#0e0d0c");
  applyLook(BUILT_IN_LOOKS.classic);
  expect(el.style.length).toBe(0);
  expect(el.hasAttribute("data-look")).toBe(false);
  expect(el.hasAttribute("data-touch-vinyl")).toBe(false);
});

it("falls back to Classic when a stored look is damaged", () => {
  const el = document.documentElement;
  const broken = { ...BUILT_IN_LOOKS.sleeve, id: "custom-x", seeds: undefined } as unknown as Look;
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => applySavedLook(broken)).not.toThrow();
  expect(el.style.length).toBe(0);
  expect(el.hasAttribute("data-look")).toBe(false);
});

it("keeps styles other code put on <html>", () => {
  const el = document.documentElement;
  el.style.setProperty("--app-font", "serif");
  applyLook(BUILT_IN_LOOKS.paper);
  applyLook(BUILT_IN_LOOKS.classic);
  expect(el.style.getPropertyValue("--app-font")).toBe("serif");
  el.style.removeProperty("--app-font");
});

it("rehydrates on a ytm-looks storage event", () => {
  localStorage.setItem(
    "ytm-looks",
    JSON.stringify({ state: { activeId: "ink" }, version: 0 }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: "ytm-looks" }));
  return vi.waitFor(() => expect(useThemeStore.getState().activeId).toBe("ink"));
});

it("gives two saves in the same millisecond different ids", () => {
  vi.spyOn(Date, "now").mockReturnValue(1_000);
  const s = useThemeStore.getState();
  const a = s.saveCustom({ ...BUILT_IN_LOOKS.paper, id: "new", name: "A" });
  const b = s.saveCustom({ ...BUILT_IN_LOOKS.paper, id: "new", name: "B" });
  vi.restoreAllMocks();
  expect(a).not.toBe(b);
});

it("any long-lived 0.8.x key means a previous install", async () => {
  const run = async (key?: string) => {
    localStorage.removeItem("ytm-looks");
    for (const k of ["ytm-settings", "ytm-whats-new", "ytm-playback", "ytm-layout"]) localStorage.removeItem(k);
    if (key) localStorage.setItem(key, "{}");
    vi.resetModules();
    return (await import("./store")).useThemeStore.getState().activeId;
  };
  expect(await run("ytm-whats-new")).toBe("classic");
  expect(await run("ytm-playback")).toBe("classic");
  expect(await run()).toBe("sleeve");
});
