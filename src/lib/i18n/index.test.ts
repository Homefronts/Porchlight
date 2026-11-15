// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const m = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  },
});

const { SHIPPED_LANGS, getLocale, loadLanguage, onLanguageChange, t } = await import(".");
const { useLanguageStore } = await import("../store/language");

vi.mock("../../locales/fr.json", () => ({ default: { common: { ok: "D'accord" } } }));
vi.mock("../../locales/de.json", () => {
  throw new Error("chunk failed");
});

afterEach(() => {
  vi.unstubAllGlobals();
  useLanguageStore.setState({ language: "system" });
});

describe("i18n runtime", () => {
  it("uses English until the file loads, then the language", async () => {
    useLanguageStore.setState({ language: "fr" });
    expect(t("common.ok")).toBe("OK");
    await loadLanguage("fr");
    expect(t("common.ok")).toBe("D'accord");
  });

  it("a file that fails to load stays unloaded, so the next call tries again", async () => {
    useLanguageStore.setState({ language: "de" });
    await expect(loadLanguage("de")).rejects.toThrow();
    expect(t("common.ok")).toBe("OK");
    await expect(loadLanguage("de")).rejects.toThrow();
  });

  it("getLocale follows resolveLanguage", () => {
    vi.stubGlobal("navigator", { language: "pt-PT" });
    // System default only picks a shipped language; pt-BR isn't one yet.
    expect(getLocale()).toBe(SHIPPED_LANGS.includes("pt-BR") ? "pt-BR" : "en");
    vi.stubGlobal("navigator", { language: "xx" });
    expect(getLocale()).toBe("en");
    useLanguageStore.setState({ language: "ko" });
    expect(getLocale()).toBe("ko");
  });

  it("onLanguageChange fires with the resolved language, and stops after unsubscribe", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    const seen: string[] = [];
    const off = onLanguageChange((l) => seen.push(l));
    useLanguageStore.setState({ language: "de" });
    useLanguageStore.setState({ language: "en" }); // same resolved language as "system" here
    useLanguageStore.setState({ language: "system" });
    off();
    useLanguageStore.setState({ language: "ja" });
    expect(seen).toEqual(["de", "en"]);
  });
});
