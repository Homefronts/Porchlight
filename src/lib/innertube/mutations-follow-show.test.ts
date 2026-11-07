import { expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("./shared", () => ({ innertubePost: post }));

import { followShow, unfollowShow } from "./mutations";

it("follows and unfollows a show by its playlistId", async () => {
  await followShow("PLshow");
  await unfollowShow("PLshow");
  expect(post).toHaveBeenNthCalledWith(1, "like/like", { target: { playlistId: "PLshow" } });
  expect(post).toHaveBeenNthCalledWith(2, "like/removelike", { target: { playlistId: "PLshow" } });
});
