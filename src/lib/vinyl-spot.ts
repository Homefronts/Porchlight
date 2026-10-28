import type { Shelf } from "@/lib/innertube/types";

/**
 * Where the vinyl goes on Home: the first card that is the playing record
 * (its track, or its album), else the first card of the first shelf.
 */
export function vinylSpot(
  shelves: Shelf[],
  playingIds: (string | undefined)[],
): { shelf: number; id: string } | null {
  const ids = playingIds.filter(Boolean);
  for (const [shelf, s] of shelves.entries()) {
    const hit = s.items.find((it) => ids.includes(it.id));
    if (hit) return { shelf, id: hit.id };
  }
  const first = shelves[0]?.items[0];
  return first ? { shelf: 0, id: first.id } : null;
}
