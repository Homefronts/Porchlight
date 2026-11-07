import { expect, it } from "vitest";
import { mergeShows, showsWithNew, sortNewEpisodes } from "./podcasts-tab";
import type { QueueTrack } from "@/lib/store/playback";
import type { EpisodeState } from "@/lib/store/episodes";

const ep = (videoId: string, showId: string): QueueTrack =>
  ({ videoId, title: videoId, thumbnails: [], episode: { showId, showTitle: showId, publishedText: "" } }) as QueueTrack;
const show = (id: string) => ({ id, title: id, thumbnails: [] });

it("merges library and local shows by id, library first", () => {
  expect(mergeShows([show("a"), show("b")], [show("b"), show("c")]).map((s) => s.id)).toEqual(["a", "b", "c"]);
});

it("flags shows that have an unplayed, unstarted episode", () => {
  const byId = {
    p: { position: 0, played: true } as EpisodeState,
    s: { position: 100, played: false } as EpisodeState,
  };
  const eps = [ep("p", "a"), ep("s", "b"), ep("n", "c")];
  expect([...showsWithNew(eps, byId)]).toEqual(["c"]);
});

it("sorts new episodes without mutating; the feed is newest first", () => {
  const eps = [ep("1", "a"), ep("2", "a")];
  expect(sortNewEpisodes(eps, "oldest").map((e) => e.videoId)).toEqual(["2", "1"]);
  expect(sortNewEpisodes(eps, "newest")).toBe(eps);
  expect(eps[0].videoId).toBe("1");
});
