import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { romanizeLines } from "@/lib/lyrics/romanize";
import { translateLines } from "@/lib/lyrics/translate";
import { useLyricsSettings } from "@/lib/store/lyrics-settings";
import type { Lyrics } from "@/lib/lyrics/types";

const DAY = 24 * 60 * 60 * 1000;

/** Pure merge; arrays are indexed by line. Source roman wins over device roman; a switch off strips that field entirely. */
export function mergeEnrichment(
  l: Lyrics,
  roman: (string | null)[] | undefined,
  tr: (string | null)[] | undefined,
  opts: { romanize: boolean; translate: boolean },
): Lyrics {
  if (l.kind !== "timed") return l;
  return {
    ...l,
    lines: l.lines.map(({ roman: src, translation: _old, ...line }, i) => {
      const r = opts.romanize ? src || roman?.[i] : null;
      const t = opts.translate ? tr?.[i] : null;
      return { ...line, ...(r ? { roman: r } : {}), ...(t ? { translation: t } : {}) };
    }),
  };
}

/** Cheap FNV-1a hash of the line texts; in the query keys so a replaced lyrics file for the same song is re-enriched. */
export function linesFingerprint(lines: { text: string }[]): string {
  let h = 0x811c9dc5;
  for (const l of lines) {
    for (let i = 0; i < l.text.length; i++) h = Math.imul(h ^ l.text.charCodeAt(i), 0x01000193);
    h = Math.imul(h ^ 10, 0x01000193); // line separator
  }
  return (h >>> 0).toString(36);
}

export function useEnrichedLyrics(lyrics: Lyrics | null, videoId: string | undefined): Lyrics | null {
  const romanize = useLyricsSettings((s) => s.romanize);
  const translate = useLyricsSettings((s) => s.translate);
  const targetLang = useLyricsSettings((s) => s.targetLang);
  const timed = lyrics?.kind === "timed" ? lyrics : null;
  const source = lyrics?.source;
  const fp = useMemo(() => (timed ? linesFingerprint(timed.lines) : ""), [timed]);
  const common = { staleTime: Infinity, gcTime: DAY, retry: false } as const;

  // bg lines are nested under `bg`, so they never reach either service.
  const { data: roman } = useQuery({
    ...common,
    queryKey: ["lyrics-roman", videoId, source, fp],
    // Lines that already have a source roman are sent blank so indexes line up.
    queryFn: () => romanizeLines(timed!.lines.map((x) => (x.roman ? "" : x.text))),
    enabled: !!timed && !!videoId && romanize,
  });
  const { data: tr } = useQuery({
    ...common,
    queryKey: ["lyrics-tr", videoId, source, targetLang, fp],
    queryFn: () => translateLines(timed!.lines.map((x) => x.text), targetLang),
    enabled: !!timed && !!videoId && translate,
  });

  return useMemo(
    () => (lyrics ? mergeEnrichment(lyrics, roman, tr, { romanize, translate }) : null),
    [lyrics, roman, tr, romanize, translate],
  );
}
