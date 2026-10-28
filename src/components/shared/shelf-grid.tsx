import { ShelfCard } from "@/components/shared/shelf-card";
import type { Shelf } from "@/lib/innertube/types";
import { useAiFilter } from "@/lib/ai/use-ai";
import { SectionLabel } from "@/components/theme/section-label";

type Props = {
  shelf: Shelf;
  /** Shelf position on the page, for its side letter. */
  index?: number;
};

// Vertical grid layout — used for shelves of `musicNavigationButtonRenderer`
// tiles (Moods & Genres). Same `<ShelfCard>` renders the tile itself; the
// only difference from `<ShelfCarousel>` is that this lays them out in a
// responsive CSS grid instead of a horizontally-scrolling row.
export function ShelfGrid({ shelf, index }: Props) {
  const items = useAiFilter()(shelf.items);
  // A shelf that was all AI is dropped rather than shown empty.
  if (items.length === 0 && shelf.items.length > 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel index={index} subtitle={shelf.subtitle}>
        {shelf.title}
      </SectionLabel>

      {/* Adaptive grid: each tile is between 14rem and 20rem wide; the
          column count auto-fills to fit the viewport. `min(100%, 14rem)`
          prevents the min from ever exceeding the container itself, so
          on very narrow viewports we collapse to a single full-width
          column instead of overflowing horizontally. */}
      <div className="grid w-full gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] [&>*]:max-w-[20rem]">
        {items.map((item) => (
          <ShelfCard key={`${item.kind}:${item.id}`} item={item} />
        ))}
      </div>
    </section>
  );
}
