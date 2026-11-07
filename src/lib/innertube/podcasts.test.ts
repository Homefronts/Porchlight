import { beforeEach, describe, expect, it, vi } from "vitest";
import library from "./__fixtures__/podcast-library.json";
import newEpisodes from "./__fixtures__/podcast-newEpisodes.json";
import showPage from "./__fixtures__/podcast-show.json";

// Fixtures are real browse responses; the HTTP plugin is stubbed so the
// continuation walk (which goes through innertubePost) never leaves the test.
const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.reject(new Error("no tauri in tests")),
}));

const { fetchLibraryShows, fetchNewEpisodes, fetchShow } = await import("./podcasts");
const { isEpisode } = await import("@/lib/store/playback");

const SHOW_ID = "PLk1Sqn_f33KuWf3tW9BBe_4TP7x8l0m3T";

function respond(body: unknown) {
  return {
    ok: true,
    status: 200,
    url: "https://music.youtube.com/youtubei/v1/browse",
    headers: { get: () => null, getSetCookie: () => [] },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  };
}

/** Serve fixtures by browseId; any continuation ends the walk. */
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (body.continuation) return Promise.resolve(respond({}));
    const pages: Record<string, unknown> = {
      FEmusic_library_non_music_audio_list: library,
      ["MPSP" + SHOW_ID]: showPage,
      VLRDPN: newEpisodes,
    };
    return Promise.resolve(respond(pages[body.browseId] ?? {}));
  });
});

describe("podcasts", () => {
  it("parses followed shows", async () => {
    const shows = await fetchLibraryShows();
    expect(shows.length).toBeGreaterThanOrEqual(1);
    for (const s of shows) {
      expect(s.id).toBeTruthy();
      expect(s.id.startsWith("MPSP")).toBe(false);
      expect(s.title).toBeTruthy();
      expect(s.thumbnails.length).toBeGreaterThan(0);
    }
    expect(shows.map((s) => s.id)).toContain(SHOW_ID);
  });

  it("parses a show's episodes", async () => {
    const { show, episodes } = await fetchShow(SHOW_ID);
    expect(show.id).toBe(SHOW_ID);
    expect(show.title).toBe("The Joe Rogan Experience");
    expect(episodes).toHaveLength(3);
    for (const e of episodes) {
      expect(e.videoId).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(e.duration).toBeGreaterThan(0);
      expect(e.episode?.showId).toBe(show.id);
      expect(e.episode?.showTitle).toBe(show.title);
      expect(e.episode?.publishedText).toBeTruthy();
    }
    expect(episodes[0].episode?.publishedText).toBe("23h ago");
    expect(episodes[0].duration).toBe(2 * 3600 + 18 * 60);
  });

  it("new episodes are marked as episodes", async () => {
    const eps = await fetchNewEpisodes();
    expect(eps).toHaveLength(3);
    for (const t of eps) {
      expect(isEpisode(t)).toBe(true);
      expect(t.episode?.showId).toBe(SHOW_ID);
      expect(t.episode?.publishedText).toBeTruthy();
    }
  });
});
