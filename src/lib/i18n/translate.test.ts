import { describe, expect, it } from "vitest";
import { LANGS, LANG_NAMES, resolveLanguage, translate, type Dict } from "./translate";

describe("resolveLanguage", () => {
  it("explicit pick wins", () => expect(resolveLanguage("de", "fr-FR")).toBe("de"));
  it.each([
    ["de-AT", "de"], ["EN-us", "en"], ["pt", "pt-BR"], ["pt-PT", "pt-BR"],
    ["zh-Hant-TW", "zh-CN"], ["zh", "zh-CN"], ["ja-JP", "ja"], ["xx", "en"], ["", "en"],
  ])("system %s -> %s", (nav, out) => expect(resolveLanguage("system", nav)).toBe(out));
});

describe("translate", () => {
  const en: Dict = { a: { b: "EN b" }, only: "EN only", hi: "Hi {name}", blank: "x {blank}", n: "n={n}" };
  const fr: Dict = { a: { b: "FR b" } };
  it("uses dict, falls back, returns key", () => {
    expect(translate(fr, en, "fr", "a.b")).toBe("FR b");
    expect(translate(fr, en, "fr", "only")).toBe("EN only");
    expect(translate(undefined, en, "fr", "only")).toBe("EN only");
    expect(translate(fr, en, "fr", "nope.x")).toBe("nope.x");
  });
  it("interpolates", () => {
    expect(translate(en, en, "en", "hi", { name: "Ann" })).toBe("Hi Ann");
    expect(translate(en, en, "en", "blank")).toBe("x {blank}");
    expect(translate(en, en, "en", "n", { n: 3 })).toBe("n=3");
  });
  it("plurals", () => {
    const e: Dict = { n_one: "{count} song", n_other: "{count} songs" };
    expect(translate(e, e, "en", "n", { count: 1 })).toBe("1 song");
    expect(translate(e, e, "en", "n", { count: 0 })).toBe("0 songs");
    expect(translate(e, e, "en", "n", { count: 2 })).toBe("2 songs");
    const ru: Dict = { n_one: "one", n_few: "few", n_many: "many", n_other: "other" };
    const t = (c: number) => translate(ru, e, "ru", "n", { count: c });
    expect([t(1), t(2), t(5), t(11), t(21), t(1.5)]).toEqual(["one", "few", "many", "many", "one", "other"]);
    const ja: Dict = { n_other: "{count}曲" };
    expect(translate(ja, e, "ja", "n", { count: 1 })).toBe("1曲");
  });
  it("missing category falls back to _other then English", () => {
    const e: Dict = { n_one: "{count} song", n_other: "{count} songs" };
    expect(translate({ n_other: "{count} X" }, e, "ru", "n", { count: 2 })).toBe("2 X");
    expect(translate({}, e, "ru", "n", { count: 1 })).toBe("1 song");
  });
});

describe("LANG_NAMES", () => {
  it("lists endonyms in LANGS order", () => {
    expect(LANGS.map((l) => LANG_NAMES[l])).toEqual([
      "English", "Español", "Português (Brasil)", "Français", "Deutsch", "Italiano", "Українська",
      "Русский", "Türkçe", "Bahasa Indonesia", "हिन्दी", "日本語", "한국어", "简体中文",
    ]);
  });
});
