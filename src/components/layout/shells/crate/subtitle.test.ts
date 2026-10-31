import { expect, it } from "vitest";
import { subtitleRuns } from "./subtitle";

const x = { id: "UCx", name: "X" };

it("links the artists in place and keeps the rest of the subtitle", () => {
  expect(subtitleRuns("Album • X • 2020", [x])).toEqual(["Album • ", x, " • 2020"]);
  expect(subtitleRuns("X & B", [x, { name: "B" }])).toEqual([x, " & B"]);
  expect(subtitleRuns("Single • X & Y", [x, { id: "UCy", name: "Y" }])).toEqual(["Single • ", x, " & ", { id: "UCy", name: "Y" }]);
});

it("falls back to the artists alone without a subtitle", () => {
  expect(subtitleRuns(undefined, [x, { name: "B" }])).toEqual([x, ", ", { name: "B" }]);
});
