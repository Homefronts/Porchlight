import { episodeStatus, minutesLeft, type EpisodeState } from "@/lib/store/episodes";

/** 7440 → "2 HR 4 MIN"; unknown → "". */
export function spokenLength(sec?: number): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [h ? `${h} HR` : "", m ? `${m} MIN` : ""].filter(Boolean).join(" ") || "1 MIN";
}

/** "50 MIN LEFT"; empty when the duration is unknown. */
export function leftLabel(s?: EpisodeState): string {
  const m = s ? minutesLeft(s) : null;
  return m === null ? "" : `${m} MIN LEFT`;
}

export function episodeTag(s: EpisodeState | undefined, duration?: number) {
  const status = episodeStatus(s);
  if (status === "played") return { status, label: "", chip: "✓ PLAYED" };
  if (status === "started") return { status, label: leftLabel(s) };
  return { status, label: spokenLength(duration), chip: "NEW" };
}

/** Index of the first episode not yet played, or 0 when all are. */
export function firstUnplayed(ids: string[], byId: Record<string, EpisodeState>): number {
  const i = ids.findIndex((id) => episodeStatus(byId[id]) !== "played");
  return i < 0 ? 0 : i;
}
