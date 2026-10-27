import { afterEach, describe, expect, it } from "vitest";
import { universalShareUrl } from "@/lib/deep-link";
import { useSettingsStore } from "@/lib/store/settings";

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
