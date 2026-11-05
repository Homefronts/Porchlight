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

import { usePlaybackStore } from "@/lib/store/playback";
import { cancelSleepTimer, sleepAfterMinutes, sleepAfterThisSong, takeEndOfSongStop, useSleepTimer } from "./sleep-timer";

const track = (videoId: string) => ({ videoId, title: videoId, thumbnails: [] });

beforeEach(() => {
  vi.useFakeTimers();
  usePlaybackStore.setState({ queue: [track("a"), track("b")], index: 0, playing: true } as never);
});
afterEach(() => {
  cancelSleepTimer();
  vi.useRealTimers();
});

it("pauses when the minutes are up, not before", () => {
  sleepAfterMinutes(15);
  vi.advanceTimersByTime(14 * 60_000);
  expect(usePlaybackStore.getState().playing).toBe(true);
  vi.advanceTimersByTime(60_000);
  expect(usePlaybackStore.getState().playing).toBe(false);
  expect(useSleepTimer.getState().endsAt).toBeNull();
});

it("cancelling keeps the music playing", () => {
  sleepAfterMinutes(15);
  cancelSleepTimer();
  vi.advanceTimersByTime(20 * 60_000);
  expect(usePlaybackStore.getState().playing).toBe(true);
});

it("end of song waits for a song to end, through any skips, and fires once", () => {
  expect(takeEndOfSongStop()).toBe(false);
  sleepAfterThisSong();
  usePlaybackStore.setState({ index: 1 });
  expect(usePlaybackStore.getState().playing).toBe(true);
  expect(useSleepTimer.getState().endOfSong).toBe(true);
  expect(takeEndOfSongStop()).toBe(true);
  expect(useSleepTimer.getState().endOfSong).toBe(false);
  expect(takeEndOfSongStop()).toBe(false);
});
