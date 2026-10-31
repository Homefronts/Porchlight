import type { Shelf, ShelfItem } from "@/lib/innertube/types";

/**
 * A few records to start from: the first of each Home shelf in order, then
 * the next ones down if there are fewer shelves. Mood tiles aren't records.
 */
export function homePicks(shelves: Shelf[], n = 3): ShelfItem[] {
  const rows = shelves.map((s) => s.items.filter((it) => it.kind !== "category"));
  const out: ShelfItem[] = [];
  const seen = new Set<string>();
  for (let depth = 0; out.length < n && rows.some((r) => r.length > depth); depth++) {
    for (const r of rows) {
      const it = r[depth];
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length === n) break;
    }
  }
  return out;
}
