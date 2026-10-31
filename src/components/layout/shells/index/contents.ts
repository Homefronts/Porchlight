import type { Shelf, ShelfItem } from "@/lib/innertube/types";

export type ContentsEntry = {
  /** The shelf's place in Home's arranged list (a stable key; titles can repeat). */
  index: number;
  /** Printed entry number, "01". */
  no: string;
  title: string;
  subtitle?: string;
  covers: ShelfItem[];
  /** "10 RECORDS". */
  count: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Home's shelves as a magazine's contents: numbered, three covers each. Empty shelves are left out. */
export function contentsEntries(shelves: Shelf[]): ContentsEntry[] {
  const out: ContentsEntry[] = [];
  shelves.forEach((s, index) => {
    if (s.items.length === 0) return;
    out.push({
      index,
      no: pad(out.length + 1),
      title: s.title,
      subtitle: s.subtitle,
      covers: s.items.slice(0, 3),
      count: `${pad(s.items.length)} RECORDS`,
    });
  });
  return out;
}
