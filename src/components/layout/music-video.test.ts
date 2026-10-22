import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/store/fullscreen", () => ({ useFullscreenStore: vi.fn() }));
vi.mock("@/lib/store/playback", () => ({ usePlaybackStore: { getState: vi.fn(), subscribe: vi.fn() } }));
vi.mock("@/lib/store/premium", () => ({ usePlaybackAllowed: vi.fn() }));
vi.mock("@/lib/store/track-source", () => ({ useTrackSourceStore: vi.fn() }));

const { layersFor, syncPicture } = await import("./music-video");

const picture = (over: Partial<{ readyState: number; currentTime: number; paused: boolean }> = {}) => ({
  readyState: 4, currentTime: 10, paused: true, play: vi.fn(async () => {}), pause: vi.fn(), ...over,
});

describe("syncPicture", () => {
  it("jumps the picture back onto the audio when it drifts, and plays along", () => {
    const v = picture({ currentTime: 3 });
    syncPicture(v, { position: 42, playing: true, status: "ready" });
    expect(v.currentTime).toBe(42);
    expect(v.play).toHaveBeenCalled();
  });

  it("leaves small drift alone, and pauses when the audio pauses or loads", () => {
    const v = picture({ currentTime: 42.2, paused: false });
    syncPicture(v, { position: 42, playing: false, status: "ready" });
    expect(v.currentTime).toBe(42.2);
    expect(v.pause).toHaveBeenCalled();
    const w = picture({ paused: false });
    syncPicture(w, { position: 10, playing: true, status: "loading" });
    expect(w.pause).toHaveBeenCalled();
  });

  it("waits for the video's metadata before touching it", () => {
    const v = picture({ readyState: 0, currentTime: 0 });
    syncPicture(v, { position: 42, playing: true, status: "ready" });
    expect(v.currentTime).toBe(0);
    expect(v.play).not.toHaveBeenCalled();
  });
});

describe("layersFor", () => {
  const at720 = { id: "v", url: "720" };
  it("loads a new quality behind the playing picture", () => {
    expect(layersFor(at720, "v", "1080")).toEqual({ front: at720, back: { id: "v", url: "1080" } });
  });
  it("keeps the playing picture while the new link is still resolving", () => {
    expect(layersFor(at720, "v", undefined)).toEqual({ front: at720, back: null });
  });
  it("replaces it outright for another video, and clears it when off", () => {
    expect(layersFor(at720, "w", "w720")).toEqual({ front: { id: "w", url: "w720" }, back: null });
    expect(layersFor(at720, "w", undefined)).toEqual({ front: null, back: null });
    expect(layersFor(at720, undefined, "720")).toEqual({ front: null, back: null });
  });
  it("settles once the new one has taken over", () => {
    const at1080 = { id: "v", url: "1080" };
    expect(layersFor(at1080, "v", "1080")).toEqual({ front: at1080, back: null });
  });
});
