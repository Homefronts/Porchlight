import { describe, expect, it, vi } from "vitest";
import { createLog, type Kv } from "./log";
import { MAX_LOOKUPS, sealQuarter } from "./seal";
import type { Play } from "./types";

function memKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
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
    const deps = { log, lookup, readPalette, excludeAi: () => false, now: () => t0, pauseMs: 0 };

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
});
