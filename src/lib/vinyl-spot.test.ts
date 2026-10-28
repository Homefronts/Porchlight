import { describe, expect, it } from "vitest";
import { vinylSpot } from "./vinyl-spot";
import type { Shelf } from "@/lib/innertube/types";

const shelf = (id: string, ...items: string[]) =>
  ({
    id,
    title: id,
    items: items.map((i) => ({ kind: "song", id: i, title: i, thumbnails: [] })),
  }) as Shelf;

describe("vinylSpot", () => {
  const shelves = [shelf("a", "x", "y"), shelf("b", "z", "album1")];

  it("finds the playing track or its album", () => {
    expect(vinylSpot(shelves, ["y", undefined])).toEqual({ shelf: 0, id: "y" });
    expect(vinylSpot(shelves, ["nope", "album1"])).toEqual({ shelf: 1, id: "album1" });
  });
  it("falls back to the first card", () => {
    expect(vinylSpot(shelves, [undefined, undefined])).toEqual({ shelf: 0, id: "x" });
    expect(vinylSpot(shelves, ["nope"])).toEqual({ shelf: 0, id: "x" });
  });
  it("is null with nothing on Home", () => {
    expect(vinylSpot([], ["x"])).toBeNull();
  });
});
