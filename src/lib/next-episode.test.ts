import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchShowFirstPage = vi.hoisted(() => vi.fn());
const fetchShowContinuation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/innertube/podcasts", () => ({ fetchShowFirstPage, fetchShowContinuation }));

const { pickNextEpisode, queueNextEpisode, startPosition } = await import("./next-episode");
const { usePlaybackStore } = await import("@/lib/store/playback");
const { useShowSortStore } = await import("@/lib/store/show-sort");
const { queryClient } = await import("@/lib/query-client");

const ep = (videoId: string) => ({ videoId, title: videoId, thumbnails: [], episode: { showId: "s", showTitle: "Show" } });
// Newest first, as YouTube lists them.
const list = [ep("e4"), ep("e3"), ep("e2"), ep("e1")];
const played = (id: string) => ({ [id]: { position: 0, played: true, updatedAt: 0, track: ep(id) } });

describe("pickNextEpisode", () => {
  it("oldest order plays the next newer episode", () => {
    expect(pickNextEpisode(ep("e2"), list, "oldest", {})?.videoId).toBe("e3");
  });

  it("newest order plays the next one down the list", () => {
    expect(pickNextEpisode(ep("e3"), list, "newest", {})?.videoId).toBe("e2");
  });

  it("skips played episodes", () => {
    expect(pickNextEpisode(ep("e3"), list, "newest", played("e2"))?.videoId).toBe("e1");
    expect(pickNextEpisode(ep("e1"), list, "oldest", played("e2"))?.videoId).toBe("e3");
  });

  it("no next episode stops", () => {
    expect(pickNextEpisode(ep("e1"), list, "newest", {})).toBeNull();
    expect(pickNextEpisode(ep("e4"), list, "oldest", {})).toBeNull();
    expect(pickNextEpisode(ep("e3"), list, "newest", { ...played("e2"), ...played("e1") })).toBeNull();
    expect(pickNextEpisode(ep("gone"), list, "newest", {})).toBeNull();
  });
});

/** Serve `list` one episode per page. */
function paged() {
  const page = (i: number) => ({ episodes: [list[i]], continuationToken: i + 1 < list.length ? String(i + 1) : undefined });
  fetchShowFirstPage.mockResolvedValue({ show: { id: "s", title: "Show" }, ...page(0) });
  fetchShowContinuation.mockImplementation(async (_show: unknown, token: string) => page(Number(token)));
}

describe("queueNextEpisode", () => {
  beforeEach(() => {
    queryClient.clear();
    fetchShowFirstPage.mockReset();
    fetchShowContinuation.mockReset();
    useShowSortStore.getState().setOrder("s", "newest");
    paged();
  });

  it("pages only until the next episode turns up", async () => {
    usePlaybackStore.setState({ queue: [ep("e3")], index: 0 });
    await queueNextEpisode(ep("e3"));
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual(["e3", "e2"]);
    // e4, e3, e2: the last page (e1) is never fetched.
    expect(fetchShowContinuation).toHaveBeenCalledTimes(2);
  });

  it("oldest order stops paging once the current episode is found", async () => {
    useShowSortStore.getState().setOrder("s", "oldest");
    usePlaybackStore.setState({ queue: [ep("e3")], index: 0 });
    await queueNextEpisode(ep("e3"));
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual(["e3", "e4"]);
    expect(fetchShowContinuation).toHaveBeenCalledTimes(1);
  });

  it("reuses the show page's cached pages", async () => {
    await queueNextEpisode(ep("e4"));
    await queueNextEpisode(ep("e4"));
    expect(fetchShowFirstPage).toHaveBeenCalledTimes(1);
  });

  it("queues the show's next episode after the last one", async () => {
    usePlaybackStore.setState({ queue: [ep("e3")], index: 0 });
    await queueNextEpisode(ep("e3"));
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual(["e3", "e2"]);
  });

  it("leaves a queue that moved on while the show loaded", async () => {
    usePlaybackStore.setState({ queue: [ep("e3"), ep("x")], index: 0 });
    await queueNextEpisode(ep("e3"));
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual(["e3", "x"]);
  });
});

describe("startPosition", () => {
  it("resumes at the saved place once the duration is known", () => {
    expect(startPosition(600, null, 3600)).toBe(600);
    expect(startPosition(600, null, NaN)).toBeNull();
    expect(startPosition(3599.5, null, 3600)).toBeNull();
    expect(startPosition(null, null, 3600)).toBeNull();
  });

  it("a seek made while loading wins over the saved place", () => {
    expect(startPosition(600, 1200, 3600)).toBe(1200);
    expect(startPosition(600, 0, 3600)).toBe(0);
    expect(startPosition(null, 90, 3600)).toBe(90);
  });
});
