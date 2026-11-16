import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
async function encodeKRC(text: string): Promise<string> {
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  void w.write(new TextEncoder().encode(text));
  void w.close();
  const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  const out = new Uint8Array(4 + z.length);
  out.set([107, 114, 99, 49]);
  z.forEach((b, i) => (out[4 + i] = b ^ KEY[i % 16]));
  return Buffer.from(out).toString("base64");
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

async function setup(route: (url: string) => Response, consent = true) {
  vi.resetModules();
  const http = await import("@tauri-apps/plugin-http");
  const fetchMock = vi.mocked(http.fetch);
  fetchMock.mockReset();
  fetchMock.mockImplementation((u: unknown) => Promise.resolve(route(String(u))));
  const { useLyricsSettings } = await import("@/lib/store/lyrics-settings");
  if (consent) useLyricsSettings.getState().answerConsent(true);
  return { fetchMock, fetchKugouLyrics: (await import("./kugou")).fetchKugouLyrics };
}

const cand = (singer: string) => ({
  song: "Paper Boats",
  singer,
  duration: 200000,
  id: "42",
  accesskey: "k",
});

describe("kugou", () => {
  beforeEach(() => globalThis.localStorage?.clear?.());

  it("Kugou: picks the matching song and returns word lines", async () => {
    const krc =
      "[0,3000]Paper Boats - Test Band (测试)\n" +
      "[1000,2000]<0,500,0>Little <500,1500,0>boats\n" +
      "[4000,2000]<0,1000,0>Float <1000,1000,0>on";
    const content = await encodeKRC(krc);
    const { fetchKugouLyrics, fetchMock } = await setup((u) =>
      u.includes("/search")
        ? json({ candidates: [cand("Cover Band"), cand("Test Band")].reverse() })
        : json({ content }),
    );
    const r = await fetchKugouLyrics({ title: "Paper Boats", artist: "Test Band", duration: 200 });
    expect(r?.kind).toBe("timed");
    if (r?.kind !== "timed") return;
    expect(r.source).toBe("kugou");
    expect(r.lines.map((l) => l.text)).toEqual(["Little boats", "Float on"]);
    expect(r.lines[0].words?.length).toBe(2);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("id=42") && u.includes("accesskey=k") && u.includes("fmt=krc"))).toBe(true);
  });

  it("Kugou: a cover by someone else is dropped", async () => {
    const { fetchKugouLyrics, fetchMock } = await setup(() => json({ candidates: [cand("Cover Band")] }));
    expect(await fetchKugouLyrics({ title: "Paper Boats", artist: "Test Band", duration: 200 })).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/download"))).toBe(false);
  });

  it("Kugou: no candidates is null; HTTP 503 throws", async () => {
    const a = await setup(() => json({ candidates: [] }));
    expect(await a.fetchKugouLyrics({ title: "Paper Boats", artist: "Test Band" })).toBeNull();
    const b = await setup(() => json({}, 503));
    await expect(b.fetchKugouLyrics({ title: "Paper Boats", artist: "Test Band" })).rejects.toThrow();
  });

  it("Kugou: refuses to run without consent", async () => {
    const { fetchKugouLyrics, fetchMock } = await setup(() => json({}), false);
    await expect(fetchKugouLyrics({ title: "x" })).rejects.toThrow("consent");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
