// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ShelfItem } from "@/lib/innertube/types";
import { linerRows, linerSides, TrackNotes } from "./liner-notes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const n = (k: number) => Array.from({ length: k }, (_, i) => i);

it("splits the first tracks into side A and side B", () => {
  expect(linerSides([], 6)).toEqual({ a: [], b: [] });

  const five = linerSides(n(5), 6);
  expect(five.a.map((r) => r.no)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
  expect(five.b).toEqual([]);

  const twelve = linerSides(n(12), 6);
  expect(twelve.a.map((r) => r.no)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
  expect(twelve.b.map((r) => [r.no, r.at])).toEqual([["B1", 6], ["B2", 7], ["B3", 8], ["B4", 9], ["B5", 10], ["B6", 11]]);

  const many = linerSides(n(177), 6);
  expect(many.a.length + many.b.length).toBe(12);
  expect(many.b[5]).toEqual({ track: 11, no: "B6", at: 11 });

  expect(linerSides(n(177), 3).b.map((r) => r.no)).toEqual(["B1", "B2", "B3"]);
});

it("fits fewer rows in shorter windows", () => {
  expect(linerRows(1032)).toBe(6);
  expect(linerRows(860)).toBe(3);
  expect(linerRows(700)).toBe(0);
});

it("lists twelve tracks, lights the playing one and plays from a row", () => {
  const tracks: ShelfItem[] = n(20).map((i) => ({
    kind: "song",
    id: `v${i}`,
    title: `Track ${i}`,
    artists: [{ name: `Artist ${i}` }],
    duration: 125,
    thumbnails: [],
  }));
  const onPlay = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(TrackNotes, {
        title: "Liked Music",
        song: null,
        tracks,
        count: 177,
        failed: false,
        perSide: 6,
        playingId: "v3",
        onPlay,
        open: createElement("a", null, "Open the full record ›"),
      }),
    ),
  );
  const rows = [...container.querySelectorAll<HTMLElement>("[data-liner-row]")];
  expect(rows).toHaveLength(12);
  expect(rows.filter((b) => b.getAttribute("aria-current"))).toEqual([rows[3]]);
  expect(rows[3].textContent).toContain("Track 3");
  expect(rows[7].textContent).toMatch(/^B2Track 7Artist 72:05$/);
  expect(container.textContent).toContain("177 tracks");
  expect(container.textContent).toContain("First 12 of 177");
  act(() => rows[7].querySelector("button")!.click());
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(onPlay).toHaveBeenCalledWith(7);
  act(() => rows[2].click());
  expect(onPlay).toHaveBeenLastCalledWith(2);
  act(() => root.unmount());
});
