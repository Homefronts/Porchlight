import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeLocalStorage } from "./safe-storage";

export type LyricsSource = "file" | "kugou" | "netease" | "ytmusic" | "lrclib" | "musixmatch" | "genius";
export const DEFAULT_ORDER: LyricsSource[] = ["file", "kugou", "netease", "ytmusic", "lrclib", "musixmatch", "genius"];
/** Sources that send the song to Chinese services; gated by `chineseConsent`. */
export const CHINESE_SOURCES: LyricsSource[] = ["kugou", "netease"];
export const SOURCE_LABELS: Record<LyricsSource, string> = {
  file: "Your lyrics files",
  kugou: "Kugou",
  netease: "NetEase",
  ytmusic: "YouTube Music",
  lrclib: "LRCLIB",
  musixmatch: "Musixmatch",
  genius: "Genius",
};
export type Consent = "unasked" | "accepted" | "declined";

export const TARGET_LANGS: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "id", label: "Indonesian" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

type LyricsSettings = {
  order: LyricsSource[];
  off: LyricsSource[];
  wordByWord: boolean;
  romanize: boolean;
  translate: boolean;
  targetLang: string;
  chineseConsent: Consent;
  /** videoId -> picked source */
  perSong: Record<string, LyricsSource>;
  setOrder(o: LyricsSource[]): void;
  setOn(s: LyricsSource, on: boolean): void;
  setWordByWord(v: boolean): void;
  setRomanize(v: boolean): void;
  setTranslate(v: boolean): void;
  setTargetLang(l: string): void;
  /** accepted removes kugou/netease from `off`; declined adds them. */
  answerConsent(accept: boolean): void;
  /** null = auto */
  pickForSong(videoId: string, s: LyricsSource | null): void;
};

const isSource = (x: unknown): x is LyricsSource => DEFAULT_ORDER.includes(x as LyricsSource);
const uniq = <T,>(a: T[]) => [...new Set(a)];
const repairOrder = (o: unknown): LyricsSource[] => {
  const kept = uniq(Array.isArray(o) ? o.filter(isSource) : []);
  return [...kept, ...DEFAULT_ORDER.filter((s) => !kept.includes(s))];
};

const LEGACY_PIN = "ytm:lyrics-source";

/** Order of sources to query, honouring `off` and the Chinese-sources consent gate. */
export function enabledSources(s: Pick<LyricsSettings, "order" | "off" | "chineseConsent">): LyricsSource[] {
  return s.order.filter(
    (x) => !s.off.includes(x) && (s.chineseConsent === "accepted" || !CHINESE_SOURCES.includes(x)),
  );
}

export const useLyricsSettings = create<LyricsSettings>()(
  persist(
    (set) => ({
      order: DEFAULT_ORDER,
      off: CHINESE_SOURCES,
      wordByWord: true,
      romanize: false,
      translate: false,
      targetLang: "en",
      chineseConsent: "unasked",
      perSong: {},
      setOrder: (o) => set({ order: repairOrder(o) }),
      setOn: (s, on) =>
        set((st) => ({ off: on ? st.off.filter((x) => x !== s) : uniq([...st.off, s]) })),
      setWordByWord: (wordByWord) => set({ wordByWord }),
      setRomanize: (romanize) => set({ romanize }),
      setTranslate: (translate) => set({ translate }),
      setTargetLang: (targetLang) => set({ targetLang }),
      answerConsent: (accept) =>
        set((st) => ({
          chineseConsent: accept ? "accepted" : "declined",
          off: accept
            ? st.off.filter((x) => !CHINESE_SOURCES.includes(x))
            : uniq([...st.off, ...CHINESE_SOURCES]),
        })),
      pickForSong: (videoId, s) =>
        set((st) => {
          const perSong = { ...st.perSong };
          if (s) perSong[videoId] = s;
          else delete perSong[videoId];
          return { perSong };
        }),
    }),
    {
      name: "ytm-lyrics-settings",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      // Also runs with no stored state (first launch), which is when the old global pin is adopted.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LyricsSettings>;
        let order = repairOrder(p.order);
        if (!persisted) {
          try {
            const pin = window.localStorage.getItem(LEGACY_PIN);
            if (pin && pin !== "auto" && isSource(pin) && !CHINESE_SOURCES.includes(pin) && pin !== "file") {
              order = [pin, ...order.filter((s) => s !== pin)];
              window.localStorage.removeItem(LEGACY_PIN);
            }
          } catch {
            // No storage, keep the default order.
          }
        }
        return {
          ...current,
          ...p,
          order,
          off: Array.isArray(p.off) ? uniq(p.off.filter(isSource)) : current.off,
        };
      },
    },
  ),
);
