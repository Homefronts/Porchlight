// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Lang } from "./translate";

let current: Lang = "de";
let onChange: (lang: Lang) => void = () => {};
const loadLanguage = vi.fn<(lang: Lang) => Promise<void>>();

vi.mock("./index", () => ({
  getLocale: () => current,
  loadLanguage: (lang: Lang) => loadLanguage(lang),
  onLanguageChange: (cb: (lang: Lang) => void) => {
    onChange = cb;
    return () => {};
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("apply", () => {
  it("a file that fails to load leaves <html lang> as en, warns, and a later change retries", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadLanguage.mockRejectedValueOnce(new Error("chunk failed"));
    await import("./apply");
    await flush();
    expect(document.documentElement.lang).toBe("en");
    expect(warn).toHaveBeenCalledTimes(1);

    loadLanguage.mockResolvedValueOnce();
    current = "fr";
    onChange("fr");
    await flush();
    expect(document.documentElement.lang).toBe("fr");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
