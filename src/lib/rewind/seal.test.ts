import { describe, expect, it, vi } from "vitest";
import { createLog, type Kv } from "./log";
import { MAX_LOOKUPS, previewQuarter, sealEnded, sealQuarter, topGenres } from "./seal";
import type { Play } from "./types";

function memKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
    getMany: async <T>(ks: string[]) => ks.map((k) => m.get(k) as T | undefined),
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
  };
}

const t0 = new Date(2026, 1, 1).getTime();
// Imported plays: no album or thumbnail, so the top tracks need lookups.
const plays: Play[] = Array.from({ length: 60 }, (_, i) => ({
  videoId: `v${i}`, title: `T${i}`, artists: [{ name: `A${i % 7}` }],
  startedAt: t0 + i * 1000, playedSec: 300, counted: true, source: "takeout",
}));

describe("sealQuarter", () => {
  it("caps lookups, saves one rewind with palettes, drops plays, and runs once", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays);
    const lookup = vi.fn(async (id: string) => ({ album: "LP", albumId: "MP1", thumb: `https://img/${id}` }));
    const readPalette = vi.fn(async () => ({ bg: ["#111111", "#222222", "#000000"] as [string, string, string], accent: "#ffffff" }));
    const deps = { log, lookup, readPalette, excludeAi: () => false, now: () => t0, pauseMs: 0, online: () => true };

    const r = await sealQuarter("2026-Q1", deps);
    expect(r).not.toBeNull();
    expect(lookup.mock.calls.length).toBeLessThanOrEqual(MAX_LOOKUPS);
    expect(r!.topSongs[0].thumb).toMatch(/^https:\/\/img\//);
    expect(Object.keys(r!.palette ?? {}).length).toBeGreaterThan(0);
    expect(await log.plays("2026-Q1")).toEqual([]);
    expect((await log.rewinds()).length).toBe(1);

    lookup.mockClear();
    expect(await sealQuarter("2026-Q1", deps)).toEqual(r);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("previews the open quarter without saving or dropping plays", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays);
    const deps = { log, lookup: async () => null, readPalette: async () => null, excludeAi: () => false, now: () => t0, pauseMs: 0, online: () => true };
    expect(await previewQuarter("2026-Q1", deps)).not.toBeNull();
    expect(await log.plays("2026-Q1")).toHaveLength(plays.length);
    expect(await log.rewinds()).toEqual([]);
  });

  const deps = (log: ReturnType<typeof createLog>, over = {}) => ({
    log, lookup: async () => null, readPalette: async () => null, excludeAi: () => false,
    now: () => new Date(2026, 7, 1).getTime(), pauseMs: 0, online: () => true, ...over,
  });

  it("seals every ended quarter, not only the last one", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays);
    await log.addImported("2026-Q2", plays.map((p) => ({ ...p, startedAt: p.startedAt + 100 * 86_400_000 })));
    await sealEnded(deps(log)); // now is in Q3
    expect((await log.rewinds()).map((r) => r.quarter)).toEqual(["2026-Q2", "2026-Q1"]);
    expect(await log.openQuarters()).toEqual([]);
  });

  it("drops plays that arrive after their quarter was sealed", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays);
    await sealEnded(deps(log));
    await log.append({ ...plays[0], startedAt: plays[0].startedAt + 5_000_000 });
    await sealEnded(deps(log));
    expect(await log.openQuarters()).toEqual([]);
  });

  it("waits while offline, and retries lookups that failed", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays);
    await sealEnded(deps(log, { online: () => false }));
    expect(await log.rewinds()).toEqual([]);
    const lookup = vi.fn(async () => {
      throw new Error("offline");
    });
    await previewQuarter("2026-Q1", deps(log, { lookup }));
    expect(await log.meta(plays[0].videoId)).toBeUndefined();
  });

  it("takes imported songs' titles from the lookup (Takeout titles are localised)", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays.map((p) => ({ ...p, title: "Angesehen: Song" })));
    const r = await previewQuarter("2026-Q1", deps(log, { lookup: async (id: string) => ({ title: `Real ${id}` }) }));
    expect(r!.topSongs[0].name).toMatch(/^Real /);
  });
});

describe("topGenres", () => {
  const a = (key: string, minutes: number) => ({ key, name: key, plays: 1, minutes });
  it("weights each artist's tags by minutes and drops tags that aren't genres", () => {
    const tags = new Map([
      ["Caamp", ["folk", "indie folk", "seen live", "americana"]],
      ["The Strokes", ["indie rock", "rock", "2000s"]],
      ["Pierce The Veil", ["post-hardcore", "Pierce the Veil"]],
    ]);
    expect(topGenres([a("Caamp", 300), a("The Strokes", 100), a("Pierce The Veil", 50)], tags)).toEqual([
      "folk", "indie folk", "americana", "indie rock", "rock",
    ]);
  });
});

describe("previewQuarter genres", () => {
  it("adds genres from the top artists' tags, and skips them when lookups fail", async () => {
    const log = createLog(memKv());
    await log.addImported("2026-Q1", plays);
    const base = { log, lookup: async () => null, readPalette: async () => null, excludeAi: () => false, now: () => t0, pauseMs: 0, online: () => true };
    const r = await previewQuarter("2026-Q1", { ...base, artistTags: async () => ["shoegaze"] });
    expect(r!.genres).toEqual(["shoegaze"]);
    const off = await previewQuarter("2026-Q1", { ...base, artistTags: async () => Promise.reject(new Error("offline")) });
    expect(off!.genres).toBeUndefined();
  });
});
