import { describe, expect, it } from "vitest";
import { exportFileName, validName } from "./manage";

describe("exportFileName", () => {
  it("strips characters Windows rejects", () => {
    expect(exportFileName('a<b>c:d"e/f\g|h?i*j')).toBe("abcdefghij.ytubic-theme.json");
  });
  it("strips control characters and trailing dots", () => {
    expect(exportFileName("Night\n\t owl. ")).toBe("Night owl.ytubic-theme.json");
  });
  it("falls back to look", () => {
    expect(exportFileName(' <>:"/ ')).toBe("look.ytubic-theme.json");
  });
});

describe("validName", () => {
  it("trims", () => expect(validName("  Dusk ")).toBe("Dusk"));
  it("rejects empty", () => expect(validName("   ")).toBeNull());
  it("caps at 60", () => {
    expect(validName("a".repeat(60))).toBe("a".repeat(60));
    expect(validName("a".repeat(61))).toBeNull();
  });
});
