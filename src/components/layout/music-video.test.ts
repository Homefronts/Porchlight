import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/store/fullscreen", () => ({ useFullscreenStore: vi.fn() }));
vi.mock("@/lib/store/playback", () => ({ usePlaybackStore: { getState: vi.fn(), subscribe: vi.fn() } }));
vi.mock("@/lib/store/premium", () => ({ usePlaybackAllowed: vi.fn() }));
vi.mock("@/lib/store/track-source", () => ({ useTrackSourceStore: vi.fn() }));

const { layersFor, stageSwitch, syncPicture } = await import("./music-video");

const picture = (over: Partial<{ readyState: number; currentTime: number; paused: boolean; seeking: boolean }> = {}) => ({
  readyState: 4, currentTime: 10, paused: true, seeking: false, play: vi.fn(async () => {}), pause: vi.fn(), ...over,
});
const playing = (position: number) => ({ position, playing: true, status: "ready" });

describe("syncPicture", () => {
  it("jumps a little ahead of the music when far behind, instead of to where it already was", () => {
    const v = picture({ currentTime: 3 });
    syncPicture(v, playing(42), 0);
    expect(v.currentTime).toBeGreaterThan(42);
    expect(v.currentTime).toBeLessThan(43);
  });

  it("never jumps again while a jump is still buffering (the old endless seek loop)", () => {
    const v = picture({ currentTime: 3 });
    syncPicture(v, playing(42), 0);
    const target = v.currentTime;
    v.seeking = true;
    syncPicture(v, playing(43.5), 900);
    expect(v.currentTime).toBe(target);
  });

  it("learns how long a jump takes and aims that far ahead next time", () => {
    const v = picture({ currentTime: 3 });
    syncPicture(v, playing(42), 0); // jump starts at t=0
    v.seeking = false;
    v.currentTime = 42.8;
    syncPicture(v, playing(44), 2000); // it took 2 s to land; now 1.2 s behind
    expect(v.currentTime).toBeGreaterThanOrEqual(44 + 2); // aims at least the 2 s a jump costs ahead
  });

  it("holds when it lands ahead, and plays once the music catches up", () => {
    const v = picture({ currentTime: 45, paused: false });
    syncPicture(v, playing(43), 0);
    expect(v.pause).toHaveBeenCalled();
    expect(v.currentTime).toBe(45);
    const w = picture({ currentTime: 45, paused: true });
    syncPicture(w, playing(44.8), 0);
    expect(w.play).toHaveBeenCalled();
  });

  it("goes exactly to the music's spot when paused, and pauses when the audio pauses or loads", () => {
    const v = picture({ currentTime: 3, paused: false });
    syncPicture(v, { position: 42, playing: false, status: "ready" }, 0);
    expect(v.currentTime).toBe(42);
    const w = picture({ paused: false });
    syncPicture(w, { position: 10, playing: true, status: "loading" }, 0);
    expect(w.pause).toHaveBeenCalled();
  });

  it("leaves small drift alone, and waits for metadata before touching anything", () => {
    const v = picture({ currentTime: 42.2, paused: false });
    syncPicture(v, playing(42), 0);
    expect(v.currentTime).toBe(42.2);
    const w = picture({ readyState: 0, currentTime: 0 });
    syncPicture(w, playing(42), 0);
    expect(w.currentTime).toBe(0);
    expect(w.play).not.toHaveBeenCalled();
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

describe("stageSwitch", () => {
  const frameA = { id: "frame A" };
  const frameB = { id: "frame B" };
  it("crossfades only once the new destination exists", () => {
    expect(stageSwitch(frameA, frameB)).toBe("crossfade");
    expect(stageSwitch(frameA, "immersive")).toBe("crossfade");
    expect(stageSwitch("immersive", frameB)).toBe("crossfade");
  });
  it("waits while a new layout's frame hasn't reported yet (the old fade, pop, fade)", () => {
    expect(stageSwitch("immersive", null)).toBe("none");
    expect(stageSwitch(frameA, null)).toBe("none");
  });
  it("does nothing when nothing moved, and doesn't crossfade on the first arrival", () => {
    expect(stageSwitch(frameA, frameA)).toBe("none");
    expect(stageSwitch(null, frameA)).toBe("first");
  });
});
