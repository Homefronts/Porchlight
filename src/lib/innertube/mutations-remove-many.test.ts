import { beforeEach, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("./shared", () => ({ innertubePost: post }));

import { removeManyFromPlaylist } from "./mutations";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ videoId: `v${i}`, setVideoId: `s${i}` }));
const sizes = () => post.mock.calls.map(([, body]) => body.actions.length);

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ status: "STATUS_SUCCEEDED" });
});

it("sends big removals in batches of 50, in order", async () => {
  expect(await removeManyFromPlaylist("p", rows(120))).toEqual({ removed: 120 });
  expect(sizes()).toEqual([50, 50, 20]);
  expect(post.mock.calls[1][1].actions[0].setVideoId).toBe("s50");
});

it("stops at a refused batch and says how many went through", async () => {
  post.mockResolvedValueOnce({ status: "STATUS_SUCCEEDED" }).mockResolvedValueOnce({ status: "STATUS_FAILED" });
  const out = await removeManyFromPlaylist("p", rows(120));
  expect(out.removed).toBe(50);
  expect(String(out.error)).toContain("STATUS_FAILED");
  expect(sizes()).toEqual([50, 50]);
});

it("reports a network failure on the first batch as nothing removed", async () => {
  post.mockRejectedValueOnce(new Error("offline"));
  const out = await removeManyFromPlaylist("p", rows(3));
  expect(out.removed).toBe(0);
  expect(String(out.error)).toContain("offline");
});
