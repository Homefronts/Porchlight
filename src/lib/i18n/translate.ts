export type Lang =
  | "en" | "es" | "pt-BR" | "fr" | "de" | "it" | "uk"
  | "ru" | "tr" | "id" | "hi" | "ja" | "ko" | "zh-CN";

export const LANGS: readonly Lang[] = [
  "en", "es", "pt-BR", "fr", "de", "it", "uk", "ru", "tr", "id", "hi", "ja", "ko", "zh-CN",
];

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  uk: "Українська",
  ru: "Русский",
  tr: "Türkçe",
  id: "Bahasa Indonesia",
  hi: "हिन्दी",
  ja: "日本語",
  ko: "한국어",
  "zh-CN": "简体中文",
};

export type Dict = { [k: string]: string | Dict };
export type Vars = Record<string, string | number>;

export function resolveLanguage(pref: "system" | Lang, navigatorLanguage: string): Lang {
  if (pref !== "system") return pref;
  const base = navigatorLanguage.toLowerCase().split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "zh") return "zh-CN";
  return LANGS.find((l) => l.toLowerCase() === base) ?? "en";
}

function lookup(dict: Dict | undefined, key: string): string | Dict | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (cur === undefined || typeof cur === "string") return undefined;
    cur = Object.prototype.hasOwnProperty.call(cur, part) ? cur[part] : undefined;
  }
  return cur;
}

function resolve(dict: Dict | undefined, lang: string, key: string, count?: number): string | undefined {
  const hit = lookup(dict, key);
  if (typeof hit === "string") return hit;
  if (count === undefined) return undefined;
  const form = lookup(dict, `${key}_${new Intl.PluralRules(lang).select(count)}`);
  if (typeof form === "string") return form;
  const other = lookup(dict, `${key}_other`);
  return typeof other === "string" ? other : undefined;
}

export function translate(
  dict: Dict | undefined,
  fallback: Dict,
  lang: Lang,
  key: string,
  vars?: Vars,
): string {
  const count = typeof vars?.count === "number" ? vars.count : undefined;
  const raw = resolve(dict, lang, key, count) ?? resolve(fallback, "en", key, count) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  );
}
