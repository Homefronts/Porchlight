import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { IconArrowLeft } from "@tabler/icons-react";
import { Loader2Icon } from "lucide-react";
import { useHomeFeed } from "@/hooks/use-home-feed";
import { ShelfCard } from "@/components/shared/shelf-card";
import { PageTitle } from "@/components/theme/look-type";
import { useAiFilter } from "@/lib/ai/use-ai";
import { useThemeStore } from "@/lib/theme/store";

export const Route = createFileRoute("/shelf/$title")({
  component: ShelfPage,
});

// A missing shelf may sit a page or two further down; past that it's gone.
const MAX_EXTRA_PAGES = 2;

/**
 * One Home shelf in full, opened from Index's contents or Crate's See all. Looked up by
 * title, Home's shelf identity (home-sections.ts), so a reshuffled feed
 * can't swap in a different shelf. Same-titled shelves open the first.
 */
function ShelfPage() {
  const { title } = Route.useParams();
  // Index calls Home "Contents"; every other layout says Home.
  const index = useThemeStore((s) => s.layout === "index");
  const { query, shelves } = useHomeFeed();
  const shelf = shelves.find((s) => s.title === title);
  const items = useAiFilter()(shelf?.items ?? []);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isLoading, error } = query;
  // Pages fetched for this title; a new title starts its own count.
  const [extra, setExtra] = useState({ title, n: 0 });
  const fetched = extra.title === title ? extra.n : 0;
  const canPage = !error && !!hasNextPage && fetched < MAX_EXTRA_PAGES;
  useEffect(() => {
    if (shelf || isLoading || isFetchingNextPage || !canPage) return;
    setExtra({ title, n: fetched + 1 });
    void fetchNextPage();
  }, [shelf, isLoading, isFetchingNextPage, canPage, fetchNextPage, title, fetched]);
  const waiting = !shelf && (isLoading || isFetchingNextPage || canPage);

  return (
    <div className="flex flex-col gap-5 px-6 pb-6 pt-4">
      <Link
        to="/"
        className="flex w-fit items-center gap-1.5 font-meta text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-3.5" />
        {index ? "Contents" : "Home"}
      </Link>
      {shelf ? (
        <>
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <PageTitle>{shelf.title}</PageTitle>
              {shelf.subtitle ? (
                <p className="mt-1 text-muted-foreground">{shelf.subtitle}</p>
              ) : null}
            </div>
            <span className="shrink-0 font-meta text-[11px] tracking-[0.08em] text-muted-foreground">
              {String(items.length).padStart(2, "0")} RECORDS
            </span>
          </div>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))]">
            {items.map((item) => (
              <ShelfCard key={`${item.kind}:${item.id}`} item={item} />
            ))}
          </div>
        </>
      ) : waiting ? (
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <p className="text-muted-foreground">
          This shelf isn't on Home any more. The feed changes when it refreshes.
        </p>
      )}
    </div>
  );
}
