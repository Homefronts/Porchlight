import { useCallback, useSyncExternalStore } from "react";
import en from "../../locales/en.json";
import { useLanguageStore } from "../store/language";
import type { Key } from "./keys";
import { resolveLanguage, translate, type Dict, type Lang, type Vars } from "./translate";

export type { Key } from "./keys";

const files = import.meta.glob<{ default: Dict }>("../../locales/*.json");
const dicts: Partial<Record<Lang, Dict>> = { en };

/** Languages with written translations. "System default" never resolves to
 *  one outside this list, and the Settings picker stays hidden until there's
 *  a second one. Add each language here when its file is filled in. */
export const SHIPPED_LANGS: readonly Lang[] = ["en"];

/** The resolved language; use it for every toLocale* and Intl call. */
export function getLocale(): Lang {
  const pref = useLanguageStore.getState().language;
  const lang = resolveLanguage(pref, typeof navigator !== "undefined" ? navigator.language : "en");
  return pref === "system" && !SHIPPED_LANGS.includes(lang) ? "en" : lang;
}

/** Works outside React; reads the current language. Falls back to English until its file loads. */
export function t(key: Key, vars?: Vars): string {
  const lang = getLocale();
  return translate(dicts[lang], en, lang, key, vars);
}

// Bumped on a language change and when a file finishes loading, so useT re-renders.
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  for (const l of listeners) l();
};

export async function loadLanguage(lang: Lang): Promise<void> {
  if (dicts[lang]) return;
  const file = files[`../../locales/${lang}.json`];
  if (!file) return;
  dicts[lang] = (await file()).default;
  bump();
}

export function onLanguageChange(cb: (lang: Lang) => void): () => void {
  let current = getLocale();
  return useLanguageStore.subscribe(() => {
    const next = getLocale();
    if (next !== current) cb((current = next));
  });
}

onLanguageChange(bump);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useT(): (key: Key, vars?: Vars) => string {
  const v = useSyncExternalStore(subscribe, () => version);
  // A new function per version, so memoized children that take `t` update too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((key: Key, vars?: Vars) => t(key, vars), [v]);
}
