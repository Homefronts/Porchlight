import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { IconArrowLeft } from "@tabler/icons-react";
import { Loader2Icon } from "lucide-react";
import { useHomeFeed } from "@/hooks/use-home-feed";
import { ShelfCard } from "@/components/shared/shelf-card";
import { PageTitle } from "@/components/theme/look-type";
import { useAiFilter } from "@/lib/ai/use-ai";

export const Route = createFileRoute("/shelf/$index")({
  component: ShelfPage,
});

/** One Home shelf in full, opened from Index's contents. */
function ShelfPage() {
  const { index } = Route.useParams();
  const { query, shelves } = useHomeFeed();
  const shelf = shelves[Number(index)];
  const items = useAiFilter()(shelf?.items ?? []);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = query;
  // A shelf further down than the loaded pages: keep loading until it's there.
  const waiting = !shelf && (isLoading || !!hasNextPage);
  useEffect(() => {
    if (!shelf && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [shelf, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col gap-5 px-6 pb-6 pt-4">
      <Link
        to="/"
        className="flex w-fit items-center gap-1.5 font-meta text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-3.5" />
        Contents
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
