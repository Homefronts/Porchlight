import { describe, expect, it } from "vitest";
import { mergeEnrichment } from "./enrich";
import type { Lyrics } from "./types";

const timed = (): Lyrics => ({
  kind: "timed",
  lines: [
    { start: 0, text: "a", roman: "src" },
    { start: 1, text: "b" },
    { start: 2, text: "c" },
  ],
});
const on = { romanize: true, translate: true };

describe("mergeEnrichment", () => {
  it("adds nothing when both switches are off", () => {
    const out = mergeEnrichment(timed(), ["x", "y", "z"], ["1", "2", "3"], { romanize: false, translate: false });
    expect(out.kind === "timed" && out.lines.map((l) => [l.roman, l.translation])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });
  it("romanize off hides source roman", () => {
    const out = mergeEnrichment(timed(), ["dev", "y", "z"], undefined, { romanize: false, translate: true });
    expect(out.kind === "timed" && out.lines.every((l) => !("roman" in l))).toBe(true);
  });
  it("keeps source roman over device roman", () => {
    const out = mergeEnrichment(timed(), ["dev", "y", null], undefined, on);
    expect(out.kind === "timed" && out.lines.map((l) => l.roman)).toEqual(["src", "y", undefined]);
  });
  it("sets translation only where non-null", () => {
    const out = mergeEnrichment(timed(), undefined, [null, "t", null], on);
    expect(out.kind === "timed" && out.lines.map((l) => l.translation)).toEqual([undefined, "t", undefined]);
  });
  it("returns plain lyrics unchanged", () => {
    const p: Lyrics = { kind: "plain", text: "hi" };
    expect(mergeEnrichment(p, ["x"], ["y"], on)).toBe(p);
  });
  it("does not mutate the input", () => {
    const l = timed();
    mergeEnrichment(l, [null, "y", null], [null, "t", null], on);
    expect(l.kind === "timed" && l.lines[1].roman).toBeUndefined();
  });
});
