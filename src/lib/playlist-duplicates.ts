import type { ShelfItem } from "@/lib/innertube/types";

/** The later copies of any song listed twice. A row with no setVideoId can't be removed. */
export function duplicateTracks(tracks: ShelfItem[]): ShelfItem[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return !!t.setVideoId;
    seen.add(t.id);
    return false;
  });
}
