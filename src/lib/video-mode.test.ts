import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { window: unknown }).window = {
  location: { search: "" },
  addEventListener: () => {},
};

const find = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<string | null>>());
vi.mock("@/lib/innertube/alternate-source", () => ({ findAlternateVideoId: find }));

const { useTrackSourceStore } = await import("@/lib/store/track-source");
const { followVideoMode } = await import("./video-mode");

const track = (videoId: string) => ({ videoId, title: videoId, thumbnails: [] });
const selected = (id: string) => useTrackSourceStore.getState().byVideoId[id]?.selected ?? "song";

beforeEach(() => {
  find.mockReset();
  useTrackSourceStore.setState({ byVideoId: {}, videoMode: false });
});

describe("followVideoMode", () => {
  it("plays the next track's music video while video mode is on", async () => {
    useTrackSourceStore.setState({ videoMode: true });
    find.mockResolvedValue("a-video");
    await followVideoMode(track("a"));
    expect(selected("a")).toBe("video");
    expect(useTrackSourceStore.getState().byVideoId.a.video).toBe("a-video");
  });

  it("plays the song when there's no video, stays in video mode, and doesn't look again", async () => {
    useTrackSourceStore.setState({ videoMode: true });
    find.mockResolvedValue(null);
    await followVideoMode(track("b"));
    await followVideoMode(track("b"));
    expect(selected("b")).toBe("song");
    expect(useTrackSourceStore.getState().videoMode).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("puts tracks back on their song once video mode is off", async () => {
    useTrackSourceStore.getState().setAlternate("c", "video", "c-video");
    useTrackSourceStore.getState().setSelected("c", "video");
    await followVideoMode(track("c"));
    expect(selected("c")).toBe("song");
    expect(find).not.toHaveBeenCalled();
  });

  it("drops a late lookup if video mode was switched off meanwhile", async () => {
    useTrackSourceStore.setState({ videoMode: true });
    find.mockImplementation(async () => {
      useTrackSourceStore.setState({ videoMode: false });
      return "d-video";
    });
    await followVideoMode(track("d"));
    expect(selected("d")).toBe("song");
  });
});
