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
  return import("./lyrics-settings");
};

beforeEach(() => m.clear());

describe("lyrics settings", () => {
  it("Kugou and NetEase start off and need consent", async () => {
    const { useLyricsSettings: u, enabledSources } = await load();
    const s = u.getState();
    expect(s.off).toEqual(expect.arrayContaining(["kugou", "netease"]));
    expect(s.chineseConsent).toBe("unasked");
    expect([s.wordByWord, s.romanize, s.translate, s.targetLang]).toEqual([true, true, true, "en"]);
    expect(enabledSources(s)).not.toContain("kugou");
    expect(enabledSources(s)).not.toContain("netease");
  });

  it("accepting turns both on; declining keeps them off", async () => {
    const { useLyricsSettings: u, enabledSources } = await load();
    u.getState().answerConsent(true);
    expect(u.getState().off).toEqual([]);
    expect(enabledSources(u.getState())).toEqual(expect.arrayContaining(["kugou", "netease"]));
    u.getState().answerConsent(false);
    expect(u.getState().off).toEqual(expect.arrayContaining(["kugou", "netease"]));
    expect(u.getState().chineseConsent).toBe("declined");
    expect(enabledSources(u.getState())).not.toContain("kugou");
  });

  it("switched on without consent still stays out", async () => {
    const { enabledSources, DEFAULT_ORDER } = await load();
    for (const chineseConsent of ["declined", "unasked"] as const)
      expect(enabledSources({ order: DEFAULT_ORDER, off: [], chineseConsent })).toEqual(
        ["file", "ytmusic", "lrclib", "musixmatch", "genius"],
      );
  });

  it("order is kept, unknown or missing sources are repaired", async () => {
    m.set("ytm-lyrics-settings", JSON.stringify({ version: 1, state: { order: ["genius", "bogus", "lrclib"], off: ["nope"] } }));
    const { useLyricsSettings: u } = await load();
    expect(u.getState().order).toEqual(["genius", "lrclib", "file", "kugou", "netease", "ytmusic", "musixmatch"]);
    expect(u.getState().off).toEqual([]);
  });

  it("migrates the old global pin", async () => {
    m.set("ytm:lyrics-source", "lrclib");
    let { useLyricsSettings: u, DEFAULT_ORDER } = await load();
    expect(u.getState().order[0]).toBe("lrclib");
    expect(u.getState().order).toHaveLength(DEFAULT_ORDER.length);
    expect(m.has("ytm:lyrics-source")).toBe(false);

    m.clear();
    m.set("ytm:lyrics-source", "auto");
    ({ useLyricsSettings: u, DEFAULT_ORDER } = await load());
    expect(u.getState().order).toEqual(DEFAULT_ORDER);
    m.clear();
    ({ useLyricsSettings: u, DEFAULT_ORDER } = await load());
    expect(u.getState().order).toEqual(DEFAULT_ORDER);
  });

  it("a Decline in another window reaches this one", async () => {
    const { useLyricsSettings: u, enabledSources } = await load();
    u.getState().answerConsent(true);
    expect(enabledSources(u.getState())).toContain("kugou");
    // The other window writes its Decline; only the storage event tells this one.
    m.set("ytm-lyrics-settings", JSON.stringify({
      version: 1,
      state: { ...JSON.parse(m.get("ytm-lyrics-settings")!).state, chineseConsent: "declined", off: ["kugou", "netease"] },
    }));
    window.dispatchEvent(new StorageEvent("storage", { key: "ytm-lyrics-settings" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(u.getState().chineseConsent).toBe("declined");
    expect(enabledSources(u.getState())).not.toContain("kugou");
    expect(enabledSources(u.getState())).not.toContain("netease");
  });
});
