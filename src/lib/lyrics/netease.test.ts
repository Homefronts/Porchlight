import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

async function setup(route: (url: string) => Response, consent = true) {
  vi.resetModules();
  const http = await import("@tauri-apps/plugin-http");
  const fetchMock = vi.mocked(http.fetch);
  fetchMock.mockReset();
  fetchMock.mockImplementation((u: unknown) => Promise.resolve(route(String(u))));
  const { useLyricsSettings } = await import("@/lib/store/lyrics-settings");
  if (consent) useLyricsSettings.getState().answerConsent(true);
  return { fetchMock, fetchNeteaseLyrics: (await import("./netease")).fetchNeteaseLyrics };
}

const song = (ms = 200000) => ({ id: 7, name: "Paper Boats", artists: [{ name: "Test Band" }], duration: ms });
const P = { title: "Paper Boats", artist: "Test Band", duration: 200 };

describe("netease", () => {
  it("NetEase: prefers yrc, falls back to lrc, attaches romalrc", async () => {
    const yrc = "[1000,2000](1000,500,0)Xiao (1500,1500,0)chuan";
    const lrc = "[00:01.00]Xiao chuan\n[00:04.00]Fu qi";
    const romalrc = "[00:01.20]xiao chuan\n[00:04.10]fu  qi";
    const withYrc = await setup((u) =>
      u.includes("/search/") ? json({ result: { songs: [song()] } }) : json({ yrc: { lyric: yrc }, lrc: { lyric: lrc }, romalrc: { lyric: romalrc } }),
    );
    const a = await withYrc.fetchNeteaseLyrics(P);
    if (a?.kind !== "timed") throw new Error("expected timed");
    expect(a.source).toBe("netease");
    expect(a.lines).toHaveLength(1);
    expect(a.lines[0].words?.length).toBe(2);
    expect(a.lines[0].roman).toBe("xiao chuan");

    const lineOnly = await setup((u) =>
      u.includes("/search/") ? json({ result: { songs: [song()] } }) : json({ lrc: { lyric: lrc }, romalrc: { lyric: romalrc }, tlyric: { lyric: "[00:01.00]ignored" } }),
    );
    const b = await lineOnly.fetchNeteaseLyrics(P);
    if (b?.kind !== "timed") throw new Error("expected timed");
    expect(b.lines.map((l) => l.text)).toEqual(["Xiao chuan", "Fu qi"]);
    expect(b.lines[0].words).toBeUndefined();
    expect(b.lines[1].roman).toBe("fu  qi");
    expect(JSON.stringify(b)).not.toContain("ignored");
  });

  it("NetEase: duration far off is dropped", async () => {
    const { fetchNeteaseLyrics, fetchMock } = await setup(() => json({ result: { songs: [song(400000)] } }));
    expect(await fetchNeteaseLyrics(P)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("NetEase: refuses to run without consent", async () => {
    const { fetchNeteaseLyrics, fetchMock } = await setup(() => json({}), false);
    await expect(fetchNeteaseLyrics({ title: "x" })).rejects.toThrow("consent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NetEase: the lrc fallback drops credit lines", async () => {
    const lrc = ["[00:00.00]作词 : Ben", "[00:00.50]作曲 : Ben", "[00:01.00]Xiao chuan"].join("\n");
    const { fetchNeteaseLyrics } = await setup((u) =>
      u.includes("/search/") ? json({ result: { songs: [song()] } }) : json({ lrc: { lyric: lrc } }),
    );
    const r = await fetchNeteaseLyrics(P);
    if (r?.kind !== "timed") throw new Error("expected timed");
    expect(r.lines.map((l) => l.text)).toEqual(["Xiao chuan"]);
  });
});
