import { describe, expect, it } from "vitest";
import { sideLetter } from "./section-label";

describe("sideLetter", () => {
  it("letters the first 26 sides A to Z", () => {
    expect(sideLetter(0)).toBe("A");
    expect(sideLetter(1)).toBe("B");
    expect(sideLetter(25)).toBe("Z");
  });
  it("carries on past Z like spreadsheet columns", () => {
    expect(sideLetter(26)).toBe("AA");
    expect(sideLetter(27)).toBe("AB");
    expect(sideLetter(51)).toBe("AZ");
    expect(sideLetter(52)).toBe("BA");
  });
});
