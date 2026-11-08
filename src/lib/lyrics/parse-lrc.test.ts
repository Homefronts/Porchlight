import { describe, expect, it } from "vitest";
import { parseLRC } from "@/lib/lyrics/parse-lrc";

describe("parseLRC", () => {
  it("parses timestamped lines and fills end from the next start", () => {
    const lines = parseLRC("[00:10.00]first\n[00:12.50]second");
    expect(lines).toEqual([
      { start: 10, end: 12.5, text: "first" },
      { start: 12.5, text: "second" },
    ]);
  });

  it("handles 1/2/3-digit fractions", () => {
    const lines = parseLRC("[00:01.5]a\n[00:02.05]b\n[00:03.005]c");
    expect(lines.map((l) => l.start)).toEqual([1.5, 2.05, 3.005]);
  });

  it("expands multi-timestamp (chorus) lines", () => {
    const lines = parseLRC("[00:05.00][00:20.00]chorus");
    expect(lines.map((l) => [l.start, l.text])).toEqual([
      [5, "chorus"],
      [20, "chorus"],
    ]);
  });

  it("skips metadata-only lines", () => {
    const lines = parseLRC("[ar:Artist]\n[ti:Title]\n[00:01.00]real");
    expect(lines).toEqual([{ start: 1, text: "real" }]);
  });

  it("applies a positive [offset] by shifting lines earlier", () => {
    const lines = parseLRC("[offset:+500]\n[00:10.00]hi");
    expect(lines[0].start).toBeCloseTo(9.5, 5);
  });

  it("applies a negative [offset] by shifting lines later", () => {
    const lines = parseLRC("[offset:-500]\n[00:10.00]hi");
    expect(lines[0].start).toBeCloseTo(10.5, 5);
  });

  it("never produces a negative start", () => {
    const lines = parseLRC("[offset:+5000]\n[00:01.00]hi");
    expect(lines[0].start).toBe(0);
  });

  it("returns [] for empty / untimed input", () => {
    expect(parseLRC("")).toEqual([]);
    expect(parseLRC("no timestamps here")).toEqual([]);
  });
});

describe("parseLRC enhanced word tags", () => {
  it("fills words from <mm:ss.xx> tags", () => {
    const [l] = parseLRC("[00:01.00]<00:01.00>Hello <00:01.50>sun<00:03.00>");
    expect(l.text).toBe("Hello sun");
    expect(l.words).toEqual([
      { start: 1, end: 1.5, text: "Hello " },
      { start: 1.5, end: 3, text: "sun" },
    ]);
  });

  it("leaves words undefined without tags", () => {
    expect(parseLRC("[00:01.00]plain")[0].words).toBeUndefined();
  });

  it("shifts word times for each copy of a repeated line", () => {
    const lines = parseLRC("[00:10.00][00:50.00]<00:10.00>a <00:11.00>b<00:12.00>\n[00:55.00]c");
    expect(lines[0].words).toEqual([
      { start: 10, end: 11, text: "a " },
      { start: 11, end: 12, text: "b" },
    ]);
    expect(lines[1].words).toEqual([
      { start: 50, end: 51, text: "a " },
      { start: 51, end: 52, text: "b" },
    ]);
  });
});
