import { describe, expect, it } from "vitest";
import { exportFileName, validName } from "./manage";

describe("exportFileName", () => {
  it("strips characters Windows rejects, backslash included", () => {
    // String.raw keeps the single backslash between f and g.
    const raw = String.raw`a<b>c:d"e/f\g|h?i*j`;
    expect(raw).toContain("\\");
    expect(exportFileName(raw)).toBe("abcdefghij.ytubic-theme.json");
  });
  it("strips control characters and trailing dots and spaces", () => {
    expect(exportFileName("Night\n\t owl. ")).toBe("Night owl.ytubic-theme.json");
    expect(exportFileName("owl . . ")).toBe("owl.ytubic-theme.json");
  });
  it("falls back to look", () => {
    expect(exportFileName(' <>:"/ ')).toBe("look.ytubic-theme.json");
    expect(exportFileName("...")).toBe("look.ytubic-theme.json");
  });
  it.each(["CON", "prn", "Aux", "NUL", "com1", "COM9", "lpt1", "LPT9", "con.", "Nul.txt"])(
    "maps the reserved name %s to a safe one",
    (n) => {
      const out = exportFileName(n);
      expect(out.startsWith("look-")).toBe(true);
      expect(out.endsWith(".ytubic-theme.json")).toBe(true);
    },
  );
  it("keeps names that only contain a reserved word", () => {
    expect(exportFileName("Console")).toBe("Console.ytubic-theme.json");
    expect(exportFileName("com10")).toBe("com10.ytubic-theme.json");
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
