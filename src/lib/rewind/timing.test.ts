import { describe, expect, it } from "vitest";
import { PlayTimer, countsAsPlay } from "./timing";

describe("countsAsPlay", () => {
  it("uses the Last.fm bar: half the length or 4 minutes, never under 30 s", () => {
    expect(countsAsPlay(29, 29)).toBe(false);
    expect(countsAsPlay(100, 200)).toBe(true);
    expect(countsAsPlay(239, 1000)).toBe(false);
    expect(countsAsPlay(240, 1000)).toBe(true);
    expect(countsAsPlay(240, undefined)).toBe(true);
  });
});

describe("PlayTimer", () => {
  it("accrues ticks and finishes once", () => {
    const t = new PlayTimer();
    t.start("a", 1000);
    t.tick(1000);
    t.tick(1000);
    t.tick(1000);
    expect(t.finish(200)).toEqual({ videoId: "a", startedAt: 1000, playedSec: 3, counted: false });
    expect(t.finish(200)).toBeNull();
  });
  it("starts a fresh play for the same video (repeat-one)", () => {
    const t = new PlayTimer();
    t.start("a", 0);
    t.tick(120_000);
    expect(t.finish(200)?.counted).toBe(true);
    t.start("a", 200_000);
    t.tick(1000);
    expect(t.finish(200)).toMatchObject({ videoId: "a", startedAt: 200_000, playedSec: 1 });
  });
});
