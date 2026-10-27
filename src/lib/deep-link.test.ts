import { afterEach, describe, expect, it } from "vitest";
import { parseDeepLink, universalShareUrl } from "@/lib/deep-link";
import { useSettingsStore } from "@/lib/store/settings";

describe("parseDeepLink", () => {
  it("reads Plus's own scheme and the original one", () => {
    expect(parseDeepLink("ytubic-plus://watch?v=dQw4w9WgXcQ&background=1")).toEqual({
      kind: "watch",
      id: "dQw4w9WgXcQ",
    });
    expect(parseDeepLink("ytubic://album/MPREb_abc123")).toEqual({ kind: "album", id: "MPREb_abc123" });
    expect(parseDeepLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("universalShareUrl", () => {
  afterEach(() => useSettingsStore.setState({ shareYtMusicLinks: false }));

  it("points at the share page by default", () => {
    expect(universalShareUrl("watch", "dQw4w9WgXcQ")).toMatch(/\/s\/\?v=dQw4w9WgXcQ$/);
  });

  it("copies plain YouTube Music links when switched on", () => {
    useSettingsStore.setState({ shareYtMusicLinks: true });
    expect(universalShareUrl("watch", "dQw4w9WgXcQ")).toBe(
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(universalShareUrl("album", "MPREb_abc123", "Title")).toBe(
      "https://music.youtube.com/browse/MPREb_abc123",
    );
    expect(universalShareUrl("playlist", "PLabc123")).toBe(
      "https://music.youtube.com/playlist?list=PLabc123",
    );
    expect(universalShareUrl("artist", "UCabc123")).toBe(
      "https://music.youtube.com/channel/UCabc123",
    );
  });
});
