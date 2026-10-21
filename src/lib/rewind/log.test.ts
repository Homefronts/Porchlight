import { describe, expect, it } from "vitest";
import { MAX_PLAYS_PER_QUARTER, createLog, type Kv } from "./log";
import type { Play, Rewind } from "./types";

function memKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
    set: async (k, v) => void m.set(k, structuredClone(v)),
    del: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
  };
}

const q1 = new Date(2026, 1, 1).getTime();
const q2 = new Date(2026, 4, 1).getTime();
const play = (videoId: string, startedAt: number, source: Play["source"] = "app"): Play => ({
  videoId, title: videoId, artists: [{ name: "A" }], startedAt, playedSec: 100, counted: true, source,
});
const rewind = (quarter: Rewind["quarter"], builtAt: number): Rewind => ({
  quarter, builtAt, minutes: 1, plays: 1, topArtists: [], topSongs: [], topAlbums: [], hours: [], newArtists: [],
});

describe("play log", () => {
  it("files plays under their quarter", async () => {
    const log = createLog(memKv());
    await log.append(play("a", q1));
    await log.append(play("b", q2));
    expect((await log.plays("2026-Q1")).map((p) => p.videoId)).toEqual(["a"]);
    expect((await log.plays("2026-Q2")).map((p) => p.videoId)).toEqual(["b"]);
  });

  it("dedupes imports against app plays and against itself", async () => {
    const log = createLog(memKv());
    await log.append(play("a", q1));
    const file = [play("a", q1 + 30_000, "takeout"), play("c", q1 + 600_000, "takeout")];
    expect(await log.addImported("2026-Q1", file)).toBe(1);
    expect(await log.addImported("2026-Q1", file)).toBe(0);
    expect((await log.plays("2026-Q1")).map((p) => p.videoId).sort()).toEqual(["a", "c"]);
  });

  it("drops raw plays when a rewind is saved, lists rewinds newest first, and clears", async () => {
    const log = createLog(memKv());
    await log.append(play("a", q1));
    await log.saveRewind(rewind("2026-Q1", 1));
    await log.saveRewind(rewind("2026-Q2", 2));
    expect(await log.plays("2026-Q1")).toEqual([]);
    expect((await log.rewinds()).map((r) => r.quarter)).toEqual(["2026-Q2", "2026-Q1"]);
    await log.clear();
    expect(await log.rewinds()).toEqual([]);
  });

  it("caps a quarter, dropping the oldest", async () => {
    const log = createLog(memKv());
    const many = Array.from({ length: MAX_PLAYS_PER_QUARTER }, (_, i) => play(`v${i}`, q1 + i * 1000, "takeout"));
    await log.addImported("2026-Q1", many);
    await log.append(play("new", q1 + MAX_PLAYS_PER_QUARTER * 1000));
    const ps = await log.plays("2026-Q1");
    expect(ps).toHaveLength(MAX_PLAYS_PER_QUARTER);
    expect(ps[0].videoId).toBe("v1");
    expect(ps[ps.length - 1].videoId).toBe("new");
  });
});
