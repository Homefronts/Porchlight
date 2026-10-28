import { describe, expect, it } from "vitest";
import { firstName, greeting } from "./greeting";

describe("greeting", () => {
  it("follows the time of day", () => {
    expect(greeting(5)).toBe("Good morning");
    expect(greeting(11)).toBe("Good morning");
    expect(greeting(12)).toBe("Good afternoon");
    expect(greeting(17)).toBe("Good afternoon");
    expect(greeting(18)).toBe("Good evening");
    expect(greeting(23)).toBe("Good evening");
    expect(greeting(0)).toBe("Good evening");
    expect(greeting(4)).toBe("Good evening");
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Alex Smith")).toBe("Alex");
    expect(firstName("  Alex  ")).toBe("Alex");
  });
  it("is empty without a name", () => {
    expect(firstName(undefined)).toBe("");
    expect(firstName("")).toBe("");
  });
});
