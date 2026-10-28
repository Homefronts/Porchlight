import { describe, expect, it } from "vitest";
import { tapeTime } from "./tape-counter";

describe("tapeTime", () => {
  it("pads minutes and seconds to two digits", () => {
    expect(tapeTime(73)).toBe("01:13");
    expect(tapeTime(216.9)).toBe("03:36");
    expect(tapeTime(0)).toBe("00:00");
  });
  it("lets minutes grow past an hour", () => {
    expect(tapeTime(3725)).toBe("62:05");
  });
  it("shows zero for bad input", () => {
    expect(tapeTime(NaN)).toBe("00:00");
    expect(tapeTime(-5)).toBe("00:00");
    expect(tapeTime(Infinity)).toBe("00:00");
  });
});
