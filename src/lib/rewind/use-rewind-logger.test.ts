// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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
const append = vi.hoisted(() => vi.fn(async (_play: unknown) => {}));
vi.mock("./log", () => ({ rewindLog: { append } }));

import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { useSettingsStore } from "@/lib/store/settings";
import { PENDING_KEY, recoverPendingPlay, useRewindLogger } from "./use-rewind-logger";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = (videoId: string): QueueTrack => ({
  videoId,
  title: `T ${videoId}`,
  artists: [{ id: "UCa", name: "Artist" }],
  album: "LP",
  thumbnails: [{ url: "small" }, { url: "big" }],
  duration: 200,
});

let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers();
  append.mockClear();
  useSettingsStore.setState({ rewindHistory: true });
  localStorage.removeItem("ytubic-rewind-pending");
  usePlaybackStore.setState({ queue: [track("a"), track("b")], index: 0, playing: false, position: 0, duration: 200, status: "ready" });
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(() => (useRewindLogger(), null))));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const set = (s: Partial<ReturnType<typeof usePlaybackStore.getState>>) => act(() => usePlaybackStore.setState(s));

it("logs one play per track, timed by real listening", () => {
  set({ playing: true });
  vi.advanceTimersByTime(60_000);
  set({ playing: false });
  vi.advanceTimersByTime(600_000); // paused time doesn't count
  set({ playing: true });
  vi.advanceTimersByTime(60_000);
  expect(append).not.toHaveBeenCalled();
  set({ index: 1 });
  expect(append).toHaveBeenCalledTimes(1);
  expect(append.mock.calls[0][0]).toMatchObject({
    videoId: "a", playedSec: 120, counted: true, thumb: "big", source: "app", artists: [{ id: "UCa", name: "Artist" }],
  });
});

it("logs nothing with history off", () => {
  act(() => useSettingsStore.setState({ rewindHistory: false }));
  set({ playing: true });
  vi.advanceTimersByTime(120_000);
  set({ index: 1 });
  expect(append).not.toHaveBeenCalled();
});

it("flushes the current play when the app closes", () => {
  set({ playing: true });
  vi.advanceTimersByTime(130_000);
  act(() => void window.dispatchEvent(new Event("pagehide")));
  expect(append).toHaveBeenCalledTimes(1);
});

it("logs a replay of the same song from the start as a new play", () => {
  set({ playing: true, position: 0 });
  vi.advanceTimersByTime(150_000);
  set({ position: 150 });
  set({ position: 0.5 }); // repeat-one jumped back to the start
  expect(append).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30_000);
  set({ index: 1 });
  expect(append).toHaveBeenCalledTimes(2);
  expect(append.mock.calls[1][0]).toMatchObject({ videoId: "a", playedSec: 30 });
});

it("dates a play from when playback starts, not when the track was queued", () => {
  vi.advanceTimersByTime(3 * 3600_000); // restored paused at launch, played later
  const later = Date.now();
  set({ playing: true });
  vi.advanceTimersByTime(60_000);
  set({ index: 1 });
  expect(append.mock.calls[0][0]).toMatchObject({ videoId: "a", startedAt: later });
});

it("doesn't count time spent loading", () => {
  set({ playing: true, status: "loading" });
  vi.advanceTimersByTime(60_000);
  set({ status: "ready" });
  vi.advanceTimersByTime(60_000);
  set({ index: 1 });
  expect(append.mock.calls[0][0]).toMatchObject({ playedSec: 60 });
});

it("keeps the play in progress safe if the app is killed, and recovers it next launch", async () => {
  set({ playing: true });
  for (let s = 5; s <= 130; s += 5) {
    vi.advanceTimersByTime(5000);
    set({ position: s });
  }
  expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
  await recoverPendingPlay();
  expect(append).toHaveBeenCalledTimes(1);
  expect(append.mock.calls[0][0]).toMatchObject({ videoId: "a" });
  expect((append.mock.calls[0][0] as { playedSec: number }).playedSec).toBeGreaterThanOrEqual(115);
  expect(localStorage.getItem(PENDING_KEY)).toBeNull();
});
