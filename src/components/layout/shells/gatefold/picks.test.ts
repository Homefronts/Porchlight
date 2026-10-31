import { expect, it } from "vitest";
import type { Shelf, ShelfItem } from "@/lib/innertube/types";
import { homePicks } from "./picks";

const item = (id: string, kind: ShelfItem["kind"] = "song"): ShelfItem => ({
  kind,
  id,
  title: id,
  thumbnails: [],
});
const shelf = (title: string, ids: (string | ShelfItem)[]): Shelf =>
  ({ title, items: ids.map((i) => (typeof i === "string" ? item(i) : i)) }) as Shelf;

it("takes the first record of each shelf in order", () => {
  const picks = homePicks([shelf("A", ["a1", "a2"]), shelf("B", ["b1"]), shelf("C", ["c1"]), shelf("D", ["d1"])]);
  expect(picks.map((p) => p.id)).toEqual(["a1", "b1", "c1"]);
});

it("goes down the shelves when there are fewer than three", () => {
  const picks = homePicks([shelf("A", ["a1", "a2", "a3"]), shelf("B", ["b1"])]);
  expect(picks.map((p) => p.id)).toEqual(["a1", "b1", "a2"]);
});

it("skips mood tiles, repeats and empty shelves", () => {
  const picks = homePicks([
    shelf("Moods", [item("m1", "category")]),
    shelf("Empty", []),
    shelf("A", ["x", "a2"]),
    shelf("B", ["x", "b2"]),
  ]);
  expect(picks.map((p) => p.id)).toEqual(["x", "a2", "b2"]);
});

it("returns what there is", () => {
  expect(homePicks([])).toEqual([]);
  expect(homePicks([shelf("A", ["a1"])]).map((p) => p.id)).toEqual(["a1"]);
});
