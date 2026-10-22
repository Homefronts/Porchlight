import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueTrack } from "@/lib/store/playback";
import type { Ranked, Rewind } from "./types";

// Same setup as playback.test.ts: present as the floating window so the
// store skips persist + localStorage.
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "?floating-player" },
  addEventListener: () => {},
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

const { usePlaybackStore, snippetWindow } = await import("@/lib/store/playback");
const { useTrackSourceStore } = await import("@/lib/store/track-source");
const { playSoundtrack } = await import("./soundtrack");

const track = (videoId: string): QueueTrack => ({ videoId, title: videoId, thumbnails: [] });
const song = (key: string): Ranked => ({ key, name: key, by: "Caamp", plays: 5, minutes: 15 });
const rewind = { topSongs: [song("s1"), song("s2"), song("s3")] } as Rewind;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("snippetWindow", () => {
  it("starts a third in and plays 25 seconds, never past the end", () => {
    expect(snippetWindow(200)).toEqual([60, 85]);
    expect(snippetWindow(30)).toEqual([5, 30]);
    expect(snippetWindow(10)).toEqual([0, 10]);
  });
});

describe("playSoundtrack", () => {
  it("plays snippets of the top songs, fading in, then fades out and puts your queue back", async () => {
    usePlaybackStore.setState({ queue: [track("a"), track("b")], index: 1, position: 42, playing: true, status: "ready", volume: 0.8 });
    const restore = playSoundtrack(rewind);
    let s = usePlaybackStore.getState();
    expect(s.queue.map((t) => t.videoId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(s.snippets).toBe(true);
    expect(s.volume).toBe(0);
    expect(s.queue[0].artists).toEqual([{ name: "Caamp" }]);

    // The first song loads: it jumps to its snippet and fades in.
    usePlaybackStore.setState({ status: "ready", duration: 200 });
    expect(usePlaybackStore.getState().pendingSeek).toBe(60);
    await vi.advanceTimersByTimeAsync(2000);
    expect(usePlaybackStore.getState().volume).toBeCloseTo(0.8);

    const done = restore();
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    s = usePlaybackStore.getState();
    expect(s).toMatchObject({ index: 1, playing: true, status: "loading", snippets: false });
    expect(s.queue.map((t) => t.videoId)).toEqual(["a", "b"]);
    expect(s.volume).toBeCloseTo(0.8);
    // Once the old song has loaded again, it jumps back to where it was.
    usePlaybackStore.setState({ status: "ready", duration: 200 });
    expect(usePlaybackStore.getState().pendingSeek).toBe(42);
  });

  it("never changes the saved video mode (songs are forced by snippet mode instead), and ends snippet mode with your queue", async () => {
    useTrackSourceStore.setState({ videoMode: true });
    usePlaybackStore.setState({ queue: [track("a")], index: 0, position: 5, playing: true, status: "ready", volume: 0.8 });
    const restore = playSoundtrack(rewind);
    expect(useTrackSourceStore.getState().videoMode).toBe(true);
    expect(usePlaybackStore.getState().snippets).toBe(true);
    const done = restore();
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(useTrackSourceStore.getState().videoMode).toBe(true);
    expect(usePlaybackStore.getState()).toMatchObject({ snippets: false, index: 0 });
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual(["a"]);
    useTrackSourceStore.setState({ videoMode: false });
  });

  it("stops the music if nothing was playing before", async () => {
    usePlaybackStore.setState({ queue: [], index: -1, position: 0, playing: false, volume: 0.5 });
    const done = playSoundtrack(rewind)();
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    const s = usePlaybackStore.getState();
    expect(s.queue).toEqual([]);
    expect(s.playing).toBe(false);
    expect(s.volume).toBe(0.5);
  });
});
