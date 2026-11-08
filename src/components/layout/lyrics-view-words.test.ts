import { describe, expect, it } from "vitest";
import type { TimedLine } from "@/lib/lyrics/types";
import {
  availabilityBadge,
  extrapolate,
  firstAgentOf,
  singerLabelAt,
} from "./lyrics-view-words";

const L = (agent?: string): TimedLine => ({
  start: 0,
  text: "la",
  ...(agent ? { agent } : {}),
});
const agents = { v1: "Ana", v2: "Bo", v1000: "group", v3: "v3", v4: "" };

describe("firstAgentOf", () => {
  it("is the first agent in line order, skipping lines without one", () => {
    expect(firstAgentOf([L(), L("v2"), L("v1")])).toBe("v2");
    expect(firstAgentOf([L(), L()])).toBeUndefined();
  });
});

describe("singerLabelAt", () => {
  const lines = [L("v1"), L("v1"), L("v2"), L(), L("v2"), L("v1")];
  it("labels only the first line of each new singer", () => {
    expect(lines.map((_, i) => singerLabelAt(lines, i, agents))).toEqual([
      "Ana",
      null,
      "Bo",
      null,
      null, // an unsung interlude line between two v2 lines is not a change of singer
      "Ana",
    ]);
  });
  it("is null without agents, for groups and for unnamed singers", () => {
    expect(singerLabelAt(lines, 0, undefined)).toBeNull();
    expect(singerLabelAt([L("v1000")], 0, agents)).toBeNull();
    expect(singerLabelAt([L("v3")], 0, agents)).toBeNull(); // name fell back to the id
    expect(singerLabelAt([L("v4")], 0, agents)).toBeNull();
    expect(singerLabelAt([L("v9")], 0, agents)).toBeNull();
  });
});

describe("availabilityBadge", () => {
  it("maps word/line/plain to WORD/LINE/TEXT and nothing else", () => {
    expect(availabilityBadge("word")).toBe("WORD");
    expect(availabilityBadge("line")).toBe("LINE");
    expect(availabilityBadge("plain")).toBe("TEXT");
    expect(availabilityBadge("loading")).toBeNull();
    expect(availabilityBadge("none")).toBeNull();
    expect(availabilityBadge("error")).toBeNull();
  });
});

describe("extrapolate", () => {
  it("holds the position while paused, however long ago the tick was", () => {
    expect(extrapolate(10, 0, 5000, false)).toBe(10);
  });
  it("runs on from the last tick while playing, capped at a second", () => {
    expect(extrapolate(10, 1000, 1250, true)).toBeCloseTo(10.25);
    expect(extrapolate(10, 0, 9000, true)).toBe(11);
  });
  it("adds nothing at the moment of resume once the clock is reset then", () => {
    expect(extrapolate(10, 7000, 7000, true)).toBe(10);
  });
  it("never runs backwards on a clock that is ahead", () => {
    expect(extrapolate(10, 2000, 1000, true)).toBe(10);
  });
});
