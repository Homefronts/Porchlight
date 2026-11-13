import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Lang } from "../i18n/translate";
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
    { name: "ytm-language", storage: createJSONStorage(() => safeLocalStorage) },
  ),
);

// The floating player is a separate JS context sharing this key; without this
// it keeps showing the old language after a change in the main window.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "ytm-language") void useLanguageStore.persist.rehydrate();
  });
}
