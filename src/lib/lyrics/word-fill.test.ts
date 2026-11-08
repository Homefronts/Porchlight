import { describe, expect, it } from "vitest";
import { lineAlign, wordFill } from "./word-fill";

const w = (start: number, end: number) => ({ start, end, text: "a " });

describe("wordFill", () => {
  it("is 0 at start, 0.5 mid, 1 at end", () => {
    expect(wordFill(w(1, 3), 1)).toBe(0);
    expect(wordFill(w(1, 3), 2)).toBe(0.5);
    expect(wordFill(w(1, 3), 3)).toBe(1);
  });
  it("clamps before and after", () => {
    expect(wordFill(w(1, 3), 0)).toBe(0);
    expect(wordFill(w(1, 3), 9)).toBe(1);
  });
  it("zero-length word: 0 before start, 1 at or after", () => {
    expect(wordFill(w(2, 2), 1.9)).toBe(0);
    expect(wordFill(w(2, 2), 2)).toBe(1);
    expect(wordFill(w(2, 2), 3)).toBe(1);
  });
  it("end < start never yields NaN", () => {
    for (const p of [0, 2, 3, 5]) {
      const v = wordFill(w(3, 2), p);
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBe(p >= 3 ? 1 : 0);
    }
  });
});

describe("lineAlign", () => {
  const agents = { v1: "A", v2: "B", v1000: "Both" };
  it("first agent left, other right", () => {
    expect(lineAlign("v1", agents, "v1")).toBe("left");
    expect(lineAlign("v2", agents, "v1")).toBe("right");
  });
  it("group centered by id, empty name or 'group'", () => {
    expect(lineAlign("v1000", agents, "v1")).toBe("center");
    expect(lineAlign("x", { x: "" }, "v1")).toBe("center");
    expect(lineAlign("x", { x: "group" }, "v1")).toBe("center");
  });
  it("no agent or no agents is left", () => {
    expect(lineAlign(undefined, agents, "v1")).toBe("left");
    expect(lineAlign("v1", undefined)).toBe("left");
    expect(lineAlign("v2", undefined, "v1")).toBe("left");
  });
});
