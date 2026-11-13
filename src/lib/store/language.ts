import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { LANGS, type Lang } from "../i18n/translate";
import { safeLocalStorage } from "./safe-storage";

type State = {
  language: "system" | Lang;
  setLanguage(l: "system" | Lang): void;
};

export const useLanguageStore = create<State>()(
  persist(
    (set) => ({
      language: "system",
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "ytm-language",
      storage: createJSONStorage(() => safeLocalStorage),
      // A hand-edited or future value would otherwise reach resolveLanguage as a bogus Lang.
      merge: (persisted, current) => {
        const l = (persisted as { language?: unknown } | undefined)?.language;
        const valid = l === "system" || LANGS.includes(l as Lang);
        return { ...current, language: valid ? (l as State["language"]) : "system" };
      },
    },
  ),
);

// The floating player is a separate JS context sharing this key; without this
// it keeps showing the old language after a change in the main window.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "ytm-language") void useLanguageStore.persist.rehydrate();
  });
}
