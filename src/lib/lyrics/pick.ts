import { hasWordTiming, type Lyrics } from "@/lib/lyrics/types";
import type { LyricsSource } from "@/lib/store/lyrics-settings";

/** "none" means the source answered and has nothing; "error" means it never answered. */
export type Availability = "word" | "line" | "plain" | "loading" | "none" | "error";

export function availabilityOf(
  data: Lyrics | null | undefined,
  isLoading: boolean,
  isError: boolean,
): Availability {
  if (data) return data.kind === "plain" ? "plain" : hasWordTiming(data) ? "word" : "line";
  return isLoading ? "loading" : isError ? "error" : "none";
}

const HAS = new Set<Availability>(["word", "line", "plain"]);

/** Song pick if it has lyrics, else first word-timed, then line-timed, then plain source in order. */
export function pickSource(
  order: LyricsSource[],
  avail: Record<LyricsSource, Availability>,
  songPick?: LyricsSource,
): LyricsSource | null {
  if (songPick && HAS.has(avail[songPick])) return songPick;
  for (const tier of ["word", "line", "plain"] as const) {
    const s = order.find((x) => avail[x] === tier);
    if (s) return s;
  }
  return null;
}
