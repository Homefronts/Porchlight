import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const queue: { videoId: string }[] = [];
const store = {
  get queue() {
    return queue;
  },
  playShelfItems: (items: { id: string }[]) => queue.splice(0, queue.length, ...items.map((t) => ({ videoId: t.id }))),
  setShuffle: () => {},
  appendToQueue: (items: { id: string }[]) => queue.push(...items.map((t) => ({ videoId: t.id }))),
};
vi.mock("@/lib/store/playback", () => ({ usePlaybackStore: { getState: () => store } }));

// Page 2 resolves only when the test says so, so both calls' tails are in flight together.
const pending: (() => void)[] = [];
vi.mock("@/lib/innertube/playlist", () => ({
  fetchPlaylistFirstPage: async () => ({ tracks: [{ id: "a1" }], continuationToken: "p2" }),
  fetchPlaylistContinuation: () =>
    new Promise((res) => pending.push(() => res({ tracks: [{ id: "a2" }], continuationToken: undefined }))),
}));

const { playPlaylistNow } = await import("./play-playlist");
const tick = () => new Promise((r) => setTimeout(r, 0));

it("stops an older call's tail when the same playlist is played again", async () => {
  const qc = new QueryClient();
  await playPlaylistNow("PL", qc);
  await playPlaylistNow("PL", qc);
  await tick();
  expect(pending).toHaveLength(2);
  pending.forEach((go) => go());
  await tick();
  expect(queue.map((t) => t.videoId)).toEqual(["a1", "a2"]);
});

it("plays the page it is handed instead of fetching", async () => {
  const shown = { tracks: [{ id: "x1" }, { id: "x2" }], continuationToken: undefined } as never;
  expect(await playPlaylistNow("PL", new QueryClient(), 1, shown)).toBe(true);
  expect(queue.map((t) => t.videoId)).toEqual(["x1", "x2"]);
});
