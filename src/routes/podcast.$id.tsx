import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, CheckIcon, PlusIcon } from "lucide-react";
import { EntityHeader } from "@/components/shared/entity-header";
import { EpisodeRow } from "@/components/podcasts/episode-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { fetchLibraryShows, fetchShow } from "@/lib/innertube/podcasts";
import { followShow, unfollowShow } from "@/lib/innertube/mutations";
import { firstUnplayed } from "@/lib/episode-view";
import { useEpisodesStore } from "@/lib/store/episodes";
import { playEpisodes } from "@/lib/play-episodes";
import { useShowSortStore } from "@/lib/store/show-sort";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/podcast/$id")({
  component: ShowPageView,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["show", params.id],
      queryFn: () => fetchShow(params.id),
    }),
});

function ShowPageView() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["show", id],
    queryFn: () => fetchShow(id),
  });
  const order = useShowSortStore((s) => s.byShow[id] ?? "newest");
  const byId = useEpisodesStore((s) => s.byId);

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <AlertCircleIcon className="size-5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-1">
          <span className="font-medium">Couldn't load show</span>
          <span className="text-muted-foreground">{(error as Error).message}</span>
        </div>
      </div>
    );
  }
  if (isLoading || !data) return <ShowSkeleton />;

  const { show, episodes } = data;
  // fetchShow gives newest first.
  const shown = order === "newest" ? episodes : [...episodes].reverse();
  const play = (from: number) => {
    playEpisodes(shown.slice(from), 0);
  };
  const unplayed = episodes.filter((e) => !byId[e.videoId]?.played).length;

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-3">
      <EntityHeader
        title={show.title}
        subtitle={show.author}
        metadata={`PODCAST · ${unplayed} UNPLAYED`}
        thumbnails={show.thumbnails}
        onPlay={() => {
          if (shown.length) play(firstUnplayed(shown.map((e) => e.videoId), byId));
        }}
        actions={<FollowButton showId={id} />}
      />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-primary">EPISODES</span>
        <div className="flex border border-border" role="group" aria-label="Sort episodes">
          {(["newest", "oldest"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={order === o}
              onClick={() => useShowSortStore.getState().setOrder(id, o)}
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
          <EpisodeRow key={t.videoId} track={t} index={i} onPlay={() => play(i)} />
        ))}
      </div>
    </div>
  );
}

function FollowButton({ showId }: { showId: string }) {
  const { data: library, refetch } = useQuery({ queryKey: ["library-shows"], queryFn: fetchLibraryShows });
  const local = useShowSortStore((s) => s.localFollows.includes(showId));
  const derived = local || !!library?.some((s) => s.id === showId);
  const [following, setFollowing] = useState(derived);
  const [pending, setPending] = useState(false);
  useEffect(() => setFollowing(derived), [derived]);

  const toggle = async () => {
    if (pending) return;
    const next = !following;
    const sort = useShowSortStore.getState();
    setFollowing(next);
    setPending(true);
    try {
      await (next ? followShow(showId) : unfollowShow(showId));
      void refetch();
    } catch {
      // YouTube refused: keep the choice in the app only.
      (next ? sort.addLocalFollow : sort.removeLocalFollow)(showId);
      // A failed unfollow of a show YouTube still follows: show the real state.
      if (!next) setFollowing(!!library?.some((s) => s.id === showId));
    }
    // Unfollowing also clears any app-only follow.
    if (!next) sort.removeLocalFollow(showId);
    setPending(false);
  };

  return (
    <Button
      variant={following ? "ghost" : "outline"}
      className={following ? "bg-foreground/[0.12] text-foreground shadow-none hover:bg-foreground/[0.18]" : undefined}
      onClick={toggle}
      disabled={pending}
    >
      {following ? <CheckIcon /> : <PlusIcon />}
      {following ? "Following" : "Follow"}
    </Button>
  );
}

function ShowSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-3">
      <Skeleton className="h-10 w-72" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
