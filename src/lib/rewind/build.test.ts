import { describe, expect, it } from "vitest";
import { MIN_SONGS, buildRewind } from "./build";
import type { Play } from "./types";

const base = new Date(2026, 1, 2, 8, 30).getTime();
let n = 0;
function play(videoId: string, artist: string, opts: Partial<Play> = {}): Play {
  return {
    videoId,
    title: `T ${videoId}`,
    artists: [{ id: `UC-${artist}`, name: artist }],
    album: `${artist} LP`,
    albumId: `MPRE-${artist}`,
    thumb: `https://img/${artist}`,
    startedAt: base + n++ * 1000,
    playedSec: 180,
    counted: true,
    source: "app",
    ...opts,
  };
}
const opts = { excludeAi: () => false, knownArtists: new Set<string>(), now: base };
// Enough distinct songs to pass the minimums.
const filler = Array.from({ length: MIN_SONGS }, (_, i) => play(`f${i}`, "Filler", { playedSec: 600 }));

describe("buildRewind", () => {
  it("ranks artists, songs and albums by counted plays", () => {
    const r = buildRewind("2026-Q1", [...filler, ...Array.from({ length: 12 }, () => play("s1", "Top")), play("s2", "Two")], opts)!;
    expect(r.topArtists[0].name).toBe("Top");
    expect(r.topArtists[0].plays).toBe(12);
    expect(r.topSongs[0].key).toBe("s1");
    expect(r.topAlbums[0].name).toBe("Top LP");
    expect(r.topArtists[0].topAlbum).toMatchObject({ id: "MPRE-Top", name: "Top LP" });
    expect(r.topArtists.length).toBeLessThanOrEqual(5);
  });

  it("counts minutes from every play, counted or not, and buckets by hour", () => {
    const r = buildRewind("2026-Q1", [...filler, play("x", "Skip", { playedSec: 60, counted: false })], opts)!;
    expect(r.minutes).toBe(MIN_SONGS * 10 + 1);
    expect(r.plays).toBe(MIN_SONGS);
    expect(r.hours[8]).toBeGreaterThan(0);
    expect(r.topArtists.some((a) => a.name === "Skip")).toBe(false);
  });

  it("leaves out what excludeAi rejects", () => {
    const ai = Array.from({ length: 30 }, () => play("ai", "Bot"));
    const r = buildRewind("2026-Q1", [...filler, ...ai], { ...opts, excludeAi: (p) => p.artists[0].name === "Bot" })!;
    expect(r.topArtists.some((a) => a.name === "Bot")).toBe(false);
  });

  it("returns null with too little listening", () => {
    expect(buildRewind("2026-Q1", [play("a", "A")], opts)).toBeNull();
  });

  it("lists only artists not heard in earlier rewinds as new", () => {
    const r = buildRewind("2026-Q1", [...filler, play("n", "Newbie")], { ...opts, knownArtists: new Set(["UC-Filler"]) })!;
    expect(r.newArtists.map((a) => a.name)).toEqual(["Newbie"]);
  });

  it("counts imported plays with no length as 3.5 minutes", () => {
    const imported = Array.from({ length: MIN_SONGS }, (_, i) => play(`i${i}`, "Imp", { playedSec: 0, source: "takeout" }));
    const r = buildRewind("2026-Q1", [...imported, ...filler], opts)!;
    expect(r.minutes).toBe(Math.round(MIN_SONGS * 3.5 + MIN_SONGS * 10));
  });

  it("builds 5,000 plays in under 200 ms", () => {
    const many = Array.from({ length: 5000 }, (_, i) => play(`v${i % 800}`, `a${i % 150}`));
    const t = performance.now();
    buildRewind("2026-Q1", many, opts);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
