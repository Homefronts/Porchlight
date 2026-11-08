import { describe, expect, it, vi } from "vitest";
import { needsRomanization, romanizeLines, scriptOf } from "./romanize";

describe("scriptOf / needsRomanization", () => {
  it("detects scripts", () => {
    expect(scriptOf("Hello")).toBe("latin");
    expect(scriptOf("こんにちは")).toBe("ja");
    expect(scriptOf("夢を見る")).toBe("ja");
    expect(scriptOf("사랑해")).toBe("ko");
    expect(scriptOf("你好")).toBe("zh");
    expect(scriptOf("Я")).toBe("cyrl");
    expect(scriptOf("α")).toBe("grek");
    expect(scriptOf("สวัสดี")).toBe("other");
    expect(needsRomanization("Hello")).toBe(false);
    expect(needsRomanization("Baby 사랑해")).toBe(true);
  });
});

describe("romanizeLines", () => {
  it("Korean", async () => {
    expect(await romanizeLines(["사랑해", "한국어"])).toEqual(["saranghae", "hangugeo"]);
  });
  it("Russian", async () => {
    expect(await romanizeLines(["Я тебя люблю"])).toEqual(["Ya tebya lyublyu"]);
  });
  it("Chinese", async () => {
    expect(await romanizeLines(["你好"])).toEqual(["nǐ hǎo"]);
  });
  it("Latin and mixed lines", async () => {
    expect(await romanizeLines(["Hello", "Baby 사랑해"])).toEqual([null, "Baby saranghae"]);
  });
  it("Japanese with kanji", async () => {
    expect(await romanizeLines(["夢を見る"])).toEqual(["yume wo miru"]);
  }, 15000);
});

describe("Japanese without the dictionary", () => {
  it("resolves null and never throws", async () => {
    vi.resetModules();
    vi.doMock("kuroshiro", () => ({
      default: class {
        init() {
          return Promise.reject(new Error("no dict"));
        }
      },
    }));
    const m = await import("./romanize");
    await expect(m.romanizeLines(["こんにちは"])).resolves.toEqual([null]);
    vi.doUnmock("kuroshiro");
  });
});
