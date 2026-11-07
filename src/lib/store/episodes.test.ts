// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  });
});

import type { QueueTrack } from "@/lib/store/playback";
import { episodeStatus, inProgress, minutesLeft, useEpisodesStore } from "./episodes";
import { useShowSortStore } from "./show-sort";

const ep = (videoId: string): QueueTrack => ({ videoId, title: videoId, thumbnails: [], episode: { showId: "s", showTitle: "S" } });
const get = (id: string) => useEpisodesStore.getState().byId[id];
const rec = (t: QueueTrack, p: number, d?: number) => useEpisodesStore.getState().record(t, p, d);

beforeEach(() => {
  useEpisodesStore.setState({ byId: {} });
  useShowSortStore.setState({ byShow: {}, localFollows: [] });
});

afterEach(() => vi.restoreAllMocks());

it("duration 0 is unknown", () => {
  rec(ep("a"), 0, 0);
  expect(episodeStatus(get("a"))).toBe("new");
  expect(get("a").played).toBe(false);
  expect(minutesLeft(get("a"))).toBeNull();
});

it("short episode uses only the 95 percent rule", () => {
  rec(ep("a"), 5, 20);
  expect(get("a").played).toBe(false);
  rec(ep("a"), 19, 20);
  expect(get("a").played).toBe(true);
});

it("keeps a known duration when a record omits it", () => {
  rec(ep("a"), 100, 3600);
  rec(ep("a"), 200);
  expect(minutesLeft(get("a"))).toBe(57);
});

it("30 seconds makes it started", () => {
  rec(ep("a"), 29);
  expect(episodeStatus(get("a"))).toBe("new");
  rec(ep("a"), 30);
  expect(episodeStatus(get("a"))).toBe("started");
});

it("95 percent or the last 30 seconds marks played", () => {
  rec(ep("a"), 3420, 3600);
  rec(ep("b"), 371, 400);
  rec(ep("c"), 369, 400);
  expect(get("a").played).toBe(true);
  expect(get("b").played).toBe(true);
  expect(get("c").played).toBe(false);
  rec(ep("a"), 10, 3600);
  expect(get("a").played).toBe(true);
});

it("unknown duration never counts as played", () => {
  rec(ep("a"), 5000, undefined);
  expect(episodeStatus(get("a"))).toBe("started");
  expect(minutesLeft(get("a"))).toBeNull();
  rec(ep("b"), 100, 6000);
  expect(minutesLeft(get("b"))).toBe(99);
});

it("mark unplayed clears progress", () => {
  useEpisodesStore.getState().markPlayed(ep("a"));
  expect(episodeStatus(get("a"))).toBe("played");
  useEpisodesStore.getState().markUnplayed("a");
  expect(episodeStatus(get("a"))).toBe("new");
  expect(get("a")?.position ?? 0).toBe(0);
});

it("songs are ignored", () => {
  rec({ videoId: "x", title: "x", thumbnails: [] }, 100, 200);
  expect(useEpisodesStore.getState().byId).toEqual({});
});

it("pick up lists newest first and skips played", () => {
  vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(3).mockReturnValueOnce(2).mockReturnValueOnce(4);
  rec(ep("a"), 100, 1000);
  rec(ep("b"), 100, 1000);
  rec(ep("c"), 100, 1000);
  rec(ep("d"), 990, 1000);
  expect(inProgress(useEpisodesStore.getState().byId).map((s) => s.track.videoId)).toEqual(["b", "c", "a"]);
});

it("remembers the order per show", () => {
  useShowSortStore.getState().setOrder("CreepCast", "oldest");
  expect(useShowSortStore.getState().orderOf("CreepCast")).toBe("oldest");
  expect(useShowSortStore.getState().orderOf("Unsubscribe")).toBe("newest");
});

it("saves on pause and on quit", () => {
  rec(ep("a"), 120, 1000);
  rec(ep("a"), 240, 1000);
  expect(JSON.parse(localStorage.getItem("ytm-episodes")!).state.byId.a.position).toBe(240);
});

it("an endless (Infinity) duration counts as unknown", () => {
  rec(ep("live"), 100, Infinity);
  expect(get("live").duration).toBeUndefined();
  expect(get("live").played).toBe(false);
  expect(minutesLeft(get("live"))).toBeNull();
  expect(minutesLeft({ ...get("live"), duration: Infinity })).toBeNull();
  // A non-finite position (onEnded on a stream) is not a spot to keep.
  rec(ep("live"), Infinity, 3600);
  expect(get("live").position).toBe(100);
});
