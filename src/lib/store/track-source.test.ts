import { describe, expect, it } from "vitest";

// The store module reads `window` at import time (floating-window check).
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "" },
  addEventListener: () => {},
};

const { resumeOnSourceSwitch } = await import("./track-source");

describe("resumeOnSourceSwitch", () => {
  const song = { videoId: "a", index: 2, streamVideoId: "a" };
  const video = { videoId: "a", index: 2, streamVideoId: "a-video" };

  it("keeps the playhead when the same track switches between song and video", () => {
    expect(resumeOnSourceSwitch(song, video, 83.4)).toBe(83.4);
    expect(resumeOnSourceSwitch(video, song, 12)).toBe(12);
  });

  it("starts from the top for anything that isn't a source switch", () => {
    expect(resumeOnSourceSwitch(null, song, 83)).toBeNull(); // first track
    expect(resumeOnSourceSwitch(song, { videoId: "b", index: 3, streamVideoId: "b" }, 83)).toBeNull(); // next track
    expect(resumeOnSourceSwitch(song, { ...song, index: 5 }, 83)).toBeNull(); // same song, other queue slot
    expect(resumeOnSourceSwitch(song, song, 83)).toBeNull(); // nothing changed
    expect(resumeOnSourceSwitch(song, video, 0.4)).toBeNull(); // hadn't really started
  });
});
