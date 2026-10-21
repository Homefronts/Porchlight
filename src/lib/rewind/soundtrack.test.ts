import { describe, expect, it } from "vitest";
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

const { usePlaybackStore } = await import("@/lib/store/playback");
const { playSoundtrack } = await import("./soundtrack");

const track = (videoId: string): QueueTrack => ({ videoId, title: videoId, thumbnails: [] });
const song = (key: string): Ranked => ({ key, name: key, by: "Caamp", plays: 5, minutes: 15 });
const rewind = { topSongs: [song("s1"), song("s2"), song("s3")] } as Rewind;

describe("playSoundtrack", () => {
  it("plays the top songs, then puts your queue back where you left off", () => {
    usePlaybackStore.setState({ queue: [track("a"), track("b")], index: 1, position: 42, playing: true, status: "ready" });
    const restore = playSoundtrack(rewind);
    const s = usePlaybackStore.getState();
    expect(s.queue.map((t) => t.videoId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(s.playing).toBe(true);
    expect(s.queue[0].artists).toEqual([{ name: "Caamp" }]);

    restore();
    expect(usePlaybackStore.getState()).toMatchObject({ index: 1, playing: true, status: "loading" });
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual(["a", "b"]);
    // Once the old song has loaded again, it jumps back to where it was.
    usePlaybackStore.setState({ status: "ready" });
    expect(usePlaybackStore.getState().pendingSeek).toBe(42);
  });

  it("stops the music if nothing was playing before", () => {
    usePlaybackStore.setState({ queue: [], index: -1, position: 0, playing: false });
    const restore = playSoundtrack(rewind);
    restore();
    expect(usePlaybackStore.getState().queue).toEqual([]);
    expect(usePlaybackStore.getState().playing).toBe(false);
  });
});
