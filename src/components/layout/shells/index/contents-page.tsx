import { Link } from "@tanstack/react-router";
import { COVER_RADIUS } from "@/components/layout/player-chrome";
import { Thumbnail } from "@/components/shared/thumbnail";
import { ArtworkOutline } from "@/components/shared/artwork-outline";
import { headlineClass, useLookFamily } from "@/components/theme/look-type";
import { useAiFilter } from "@/lib/ai/use-ai";
import type { Shelf } from "@/lib/innertube/types";
import { cn } from "@/lib/utils";
import { contentsEntries } from "./contents";

/** Index's Home: each shelf an entry, opening on its shelf page. */
export function Contents({ shelves }: { shelves: Shelf[] }) {
  const family = useLookFamily();
  const filter = useAiFilter();
  const entries = contentsEntries(
    shelves.map((s) => ({ ...s, items: filter(s.items) })),
  );
  return (
    <ol className="flex flex-col">
      {entries.map((e) => (
        <li key={e.index}>
          <Link
            to="/shelf/$title"
            params={{ title: e.title }}
            className="group grid grid-cols-[46px_1fr_auto] items-baseline gap-3.5 border-t border-w110 pb-3.5 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-meta text-[13px] text-acc1">{e.no}</span>
            <div className="min-w-0">
              <div
                className={cn(
                  "text-[30px] font-semibold leading-none tracking-tight group-hover:underline",
                  headlineClass(family),
                )}
              >
                {e.title}
                {e.subtitle ? (
                  <i className="ms-2 text-muted-foreground">{e.subtitle}</i>
                ) : null}
              </div>
              <div className="mt-2.5 flex gap-2">
                {e.covers.map((it) => (
                  <div key={`${it.kind}:${it.id}`} className="relative isolate size-[74px] shrink-0">
                    <Thumbnail
                      thumbnails={it.thumbnails}
                      alt=""
                      round={it.kind === "artist"}
                      className={cn("size-full", it.kind !== "artist" && COVER_RADIUS)}
                      targetSize={160}
                    />
                    {it.kind !== "artist" && <ArtworkOutline className={COVER_RADIUS} />}
                  </div>
                ))}
                <span className="line-clamp-4 max-w-[150px] self-end font-meta text-[11px] leading-tight text-muted-foreground">
                  {e.covers.map((it) => it.title).join(", ")}
                </span>
              </div>
            </div>
            <span className="font-meta text-[11px] tracking-[0.08em] text-muted-foreground">
              {e.count}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
