import { expect, it } from "vitest";
import type { ShelfItem } from "@/lib/innertube/types";
import { duplicateTracks } from "./playlist-duplicates";

const row = (id: string, setVideoId?: string): ShelfItem =>
  ({ kind: "song", id, title: id, thumbnails: [], setVideoId }) as ShelfItem;

it("keeps the first copy and returns the later ones", () => {
  const out = duplicateTracks([row("a", "1"), row("b", "2"), row("a", "3"), row("a", "4")]);
  expect(out.map((t) => t.setVideoId)).toEqual(["3", "4"]);
});

it("finds nothing in a playlist with no repeats, and skips rows it can't remove", () => {
  expect(duplicateTracks([row("a", "1"), row("b", "2")])).toEqual([]);
  expect(duplicateTracks([row("a", "1"), row("a")])).toEqual([]);
});
