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

const { formatDateTime, formatRelative } = await import("./format");
const { t } = await import("./i18n");
const { useLanguageStore } = await import("./store/language");

afterEach(() => {
  vi.useRealTimers();
  useLanguageStore.setState({ language: "system" });
});

describe("formatDateTime", () => {
  const ms = Date.UTC(2026, 10, 12, 15, 42);

  it("follows the chosen language", () => {
    useLanguageStore.setState({ language: "de" });
    expect(formatDateTime(ms)).toMatch(/12\.11\.2026|12\. Nov/);
  });

  it("matches the old English output", () => {
    useLanguageStore.setState({ language: "en" });
    expect(formatDateTime(ms)).toBe(
      new Date(ms).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }),
    );
  });
});

describe("formatRelative", () => {
  const now = Date.UTC(2026, 10, 12, 12);
  const ago = (s: number) => now / 1000 - s;

  it("keeps the English wording", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    useLanguageStore.setState({ language: "en" });
    expect(formatRelative(ago(10))).toBe("just now");
    expect(formatRelative(ago(300))).toBe("5m ago");
    expect(formatRelative(ago(3 * 3600))).toBe("3h ago");
    expect(formatRelative(ago(2 * 86400))).toBe("2d ago");
  });

  it("goes through the translation keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    useLanguageStore.setState({ language: "de" });
    expect(formatRelative(ago(3 * 3600))).toBe(t("time.hoursAgo", { count: 3 }));
  });
});
