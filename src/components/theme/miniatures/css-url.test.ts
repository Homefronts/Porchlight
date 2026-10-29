import { describe, expect, it } from "vitest";
import { cssUrl } from "./css-url";

describe("cssUrl", () => {
  it("leaves a plain URL alone", () => {
    expect(cssUrl("https://x.test/a.jpg")).toBe('url("https://x.test/a.jpg")');
  });
  it("escapes a double quote so the url cannot break out", () => {
    expect(cssUrl('a".jpg);x:y')).toBe('url("a\\".jpg);x:y")');
  });
  it("escapes backslashes and newlines", () => {
    expect(cssUrl("a\\b")).toBe('url("a\\\\b")');
    expect(cssUrl("a\nb")).toBe('url("a\\a b")');
  });
});
