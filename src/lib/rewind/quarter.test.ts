import { describe, expect, it } from "vitest";
import { previousQuarter, quarterOf, quarterRange } from "./quarter";

describe("quarters", () => {
  it("puts the last minute of March in Q1 and April 1st in Q2", () => {
    expect(quarterOf(new Date(2026, 2, 31, 23, 59).getTime())).toBe("2026-Q1");
    expect(quarterOf(new Date(2026, 3, 1).getTime())).toBe("2026-Q2");
  });
  it("gives local-time ranges, end exclusive", () => {
    expect(quarterRange("2026-Q4")).toEqual({
      start: new Date(2026, 9, 1).getTime(),
      end: new Date(2027, 0, 1).getTime(),
    });
  });
  it("steps back across the year", () => {
    expect(previousQuarter("2026-Q1")).toBe("2025-Q4");
    expect(previousQuarter("2026-Q3")).toBe("2026-Q2");
  });
});
