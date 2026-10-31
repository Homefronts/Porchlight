import { expect, it } from "vitest";
import type { Shelf, ShelfItem } from "@/lib/innertube/types";
import { contentsEntries } from "./contents";

const item = (id: string): ShelfItem => ({ kind: "album", id, title: id, thumbnails: [] });
const shelf = (title: string, n: number, subtitle?: string): Shelf => ({
  id: title,
  title,
  subtitle,
  items: Array.from({ length: n }, (_, i) => item(`${title}${i}`)),
});

it("numbers the shelves with three covers and a record count each", () => {
  const out = contentsEntries([shelf("Pump it up", 10, "the energy picks"), shelf("Quick picks", 2)]);
  expect(out).toEqual([
    {
      index: 0,
      no: "01",
      title: "Pump it up",
      subtitle: "the energy picks",
      covers: [item("Pump it up0"), item("Pump it up1"), item("Pump it up2")],
      count: "10 RECORDS",
    },
    {
      index: 1,
      no: "02",
      title: "Quick picks",
      subtitle: undefined,
      covers: [item("Quick picks0"), item("Quick picks1")],
      count: "02 RECORDS",
    },
  ]);
});

it("skips empty shelves but keeps each entry's link to its own shelf", () => {
  const out = contentsEntries([shelf("A", 0), shelf("B", 4)]);
  expect(out.map((e) => [e.index, e.no])).toEqual([[1, "01"]]);
});
