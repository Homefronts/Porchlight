import { describe, expect, it, vi } from "vitest";

vi.mock("./search", () => ({ fetchSearch: vi.fn() }));
vi.mock("./shared", () => ({ rawNext: vi.fn() }));

const { pairOf, matchesTrack } = await import("./alternate-source");
import type { ShelfItem } from "./types";

const item = (title: string, artist?: string, kind: ShelfItem["kind"] = "video"): ShelfItem =>
  ({ kind, id: "x", title, thumbnails: [], artists: artist ? [{ name: artist }] : [] }) as ShelfItem;

describe("matchesTrack", () => {
  const strokes = ["The Strokes"];
  it("accepts the official video under its usual titles", () => {
    expect(matchesTrack(item("The Adults Are Talking (Official Video)", "The Strokes"), "The Adults Are Talking", strokes)).toBe(true);
    expect(matchesTrack(item("The Strokes - The Adults Are Talking (Official Music Video)", "TheStrokesVEVO"), "The Adults Are Talking", strokes)).toBe(true);
  });

  it("rejects other songs, other artists, other takes and audio uploads", () => {
    expect(matchesTrack(item("Reptilia (Official Video)", "The Strokes"), "The Adults Are Talking", strokes)).toBe(false);
    expect(matchesTrack(item("The Adults Are Talking (Official Video)", "Some Cover Band"), "The Adults Are Talking", strokes)).toBe(false);
    expect(matchesTrack(item("The Adults Are Talking (Live at Madison Square Garden)", "The Strokes"), "The Adults Are Talking", strokes)).toBe(false);
    expect(matchesTrack(item("The Strokes - The Adults Are Talking (Lyrics)", "Lyric Vault"), "The Adults Are Talking", strokes)).toBe(false);
    expect(matchesTrack(item("The Adults Are Talking - The Strokes cover", "Jamie"), "The Adults Are Talking", strokes)).toBe(false);
    expect(matchesTrack(item("The Adults Are Talking (Official Audio)", "The Strokes"), "The Adults Are Talking", strokes)).toBe(false);
  });

  it("allows a live take when the track itself is one", () => {
    expect(matchesTrack(item("Hurt (Live)", "Johnny Cash"), "Hurt (Live)", ["Johnny Cash"])).toBe(true);
  });
});

describe("pairOf", () => {
  const type = (t: string) => ({ watchEndpoint: { watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: `MUSIC_VIDEO_TYPE_${t}` } } } });
  const panel = (...contents: unknown[]) => ({
    contents: { singleColumnMusicWatchNextResultsRenderer: { tabbedRenderer: { watchNextTabbedResultsRenderer: { tabs: [{ tabRenderer: { content: { musicQueueRenderer: { content: { playlistPanelRenderer: { contents } } } } } }] } } } },
  });
  const paired = panel(
    { playlistPanelVideoRenderer: { videoId: "other", navigationEndpoint: type("ATV") } },
    {
      playlistPanelVideoWrapperRenderer: {
        primaryRenderer: { playlistPanelVideoRenderer: { videoId: "song1", navigationEndpoint: type("ATV") } },
        counterpart: [{ counterpartRenderer: { playlistPanelVideoRenderer: { videoId: "video1", navigationEndpoint: type("OMV") } } }],
      },
    },
  );

  it("returns YouTube Music's own pair, from either side, and what each side is", () => {
    expect(pairOf(paired, "song1")).toEqual({ self: "song", other: "video1" });
    expect(pairOf(paired, "video1")).toEqual({ self: "video", other: "song1" });
  });

  it("knows a lone track's kind, so a music video in the queue isn't swapped for another upload", () => {
    expect(pairOf(panel({ playlistPanelVideoRenderer: { videoId: "mv", navigationEndpoint: type("OMV") } }), "mv")).toEqual({ self: "video", other: undefined });
    expect(pairOf(paired, "nope")).toEqual({});
    expect(pairOf(null, "song1")).toEqual({});
  });
});
