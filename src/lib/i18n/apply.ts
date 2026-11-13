import { getLocale, loadLanguage, onLanguageChange } from ".";
import type { Lang } from "./translate";

async function apply(lang: Lang): Promise<void> {
  await loadLanguage(lang);
  // A newer change may have landed while this file loaded.
  if (getLocale() === lang) document.documentElement.lang = lang;
}

// Imported once from main.tsx, so both windows load and apply the language.
if (typeof document !== "undefined") {
  void apply(getLocale());
  onLanguageChange((lang) => void apply(lang));
}
