import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { EpisodeRow } from "@/components/podcasts/episode-row";
import { Thumbnail } from "@/components/shared/thumbnail";
import { PageTitle } from "@/components/theme/look-type";
import { fetchLibraryShows, fetchNewEpisodes, fetchShow } from "@/lib/innertube/podcasts";
import { mergeShows, showsWithNew, sortNewEpisodes } from "@/lib/podcasts-tab";
import { playEpisodes } from "@/lib/play-episodes";
import { leftLabel } from "@/lib/episode-view";
import { inProgress, useEpisodesStore } from "@/lib/store/episodes";
import { useShowSortStore } from "@/lib/store/show-sort";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/podcasts")({
  component: PodcastsPage,
});

const LABEL = "font-mono text-[11px] font-semibold tracking-[0.14em] text-primary";

function PodcastsPage() {
  const byId = useEpisodesStore((s) => s.byId);
  const localIds = useShowSortStore((s) => s.localFollows);
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const library = useQuery({ queryKey: ["library-shows"], queryFn: fetchLibraryShows });
  const fresh = useQuery({ queryKey: ["new-episodes"], queryFn: fetchNewEpisodes });
  // App-only follows are just ids: fetch each show lazily (same cache key as the show page).
  const locals = useQueries({
    queries: localIds.map((id) => ({ queryKey: ["show", id], queryFn: () => fetchShow(id) })),
  });

  const shows = mergeShows(
    library.data ?? [],
    locals.flatMap((q) => (q.data ? [q.data.show] : [])),
  );
  const dots = showsWithNew(fresh.data ?? [], byId);
  const started = inProgress(byId);
  const shown = sortNewEpisodes(fresh.data ?? [], order);
  const loading = library.isLoading || locals.some((q) => q.isLoading);

  return (
    <div className="flex flex-col gap-8 px-6 pb-6 pt-3">
      <PageTitle>Podcasts</PageTitle>

      {started.length ? (
        <section className="flex flex-col gap-3">
          <span className={LABEL}>PICK UP WHERE YOU LEFT OFF</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {started.map((s) => (
              <button
                key={s.track.videoId}
                type="button"
                onClick={() => playEpisodes([s.track], 0)}
                className="flex items-center gap-3 border border-border p-2.5 text-left hover:bg-accent/60"
              >
                <Thumbnail thumbnails={s.track.thumbnails} alt="" className="size-14 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{s.track.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.track.episode?.showTitle}</div>
                  <div className="mt-1.5 h-[3px] bg-border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {leftLabel(s)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <span className={LABEL}>YOUR SHOWS</span>
        {shows.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {shows.map((s) => (
              <Link key={s.id} to="/podcast/$id" params={{ id: s.id }} className="group flex flex-col gap-2">
                <div className="relative">
                  <Thumbnail thumbnails={s.thumbnails} alt="" className="aspect-square w-full rounded-sm" />
                  {dots.has(s.id) ? (
                    <span aria-label="New episodes" className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
                  ) : null}
                </div>
                <span className="truncate text-sm group-hover:underline">{s.title}</span>
              </Link>
            ))}
          </div>
        ) : loading ? null : (
          <p className="text-sm text-muted-foreground">Follow a show from Search and it shows up here.</p>
        )}
      </section>

      {shows.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className={LABEL}>NEW FROM YOUR SHOWS</span>
            <div className="flex border border-border" role="group" aria-label="Sort new episodes">
              {(["newest", "oldest"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={order === o}
                  onClick={() => setOrder(o)}
                  className={cn(
                    "px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
                    order === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            {shown.map((t, i) => (
              <EpisodeRow key={t.videoId} track={t} index={i} onPlay={() => playEpisodes(shown, i)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
