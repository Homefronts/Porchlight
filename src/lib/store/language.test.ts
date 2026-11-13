// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  },
});

const load = async () => {
  vi.resetModules();
  return import("./language");
};

beforeEach(() => m.clear());

describe("language store", () => {
  it("defaults to the system language", async () => {
    const { useLanguageStore } = await load();
    expect(useLanguageStore.getState().language).toBe("system");
  });

  it("setLanguage is saved", async () => {
    const { useLanguageStore } = await load();
    useLanguageStore.getState().setLanguage("ja");
    expect(JSON.parse(m.get("ytm-language")!).state.language).toBe("ja");
  });

  it("an unknown stored language falls back to system", async () => {
    m.set("ytm-language", JSON.stringify({ state: { language: "xx" }, version: 0 }));
    const { useLanguageStore } = await load();
    expect(useLanguageStore.getState().language).toBe("system");
  });

  it("a change in another window reaches this one", async () => {
    const { useLanguageStore } = await load();
    m.set("ytm-language", JSON.stringify({ state: { language: "de" }, version: 0 }));
    window.dispatchEvent(new StorageEvent("storage", { key: "ytm-language" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(useLanguageStore.getState().language).toBe("de");
  });
});
