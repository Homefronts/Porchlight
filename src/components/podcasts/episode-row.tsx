import { Thumbnail } from "@/components/shared/thumbnail";
import { TrackContextMenu, TrackMoreMenu } from "@/components/shared/track-context-menu";
import { episodeTag } from "@/lib/episode-view";
import type { ShelfItem } from "@/lib/innertube/types";
import { useEpisodesStore } from "@/lib/store/episodes";
import type { QueueTrack } from "@/lib/store/playback";
import { cn } from "@/lib/utils";

/** The shelf-row form of an episode, which the track menus take. */
const asItem = (t: QueueTrack): ShelfItem => ({
  kind: "song",
  id: t.videoId,
  title: t.title,
  subtitle: t.subtitle,
  thumbnails: t.thumbnails,
  duration: t.duration,
  episode: t.episode,
});

/** One episode: date, thumbnail, title, and a NEW / N MIN LEFT / PLAYED tag. `index` is its place in the list; `onPlay` queues from here. */
export function EpisodeRow({ track, index, onPlay }: { track: QueueTrack; index: number; onPlay: () => void }) {
  const state = useEpisodesStore((s) => s.byId[track.videoId]);
  const tag = episodeTag(state, state?.duration ?? track.duration);
  const item = asItem(track);
  const pct = state?.duration ? Math.min(100, (state.position / state.duration) * 100) : 0;
  return (
    <TrackContextMenu item={item}>
      <div
        role="button"
        tabIndex={0}
        data-index={index}
        onClick={onPlay}
        onKeyDown={(e) => {
          // Ignore keys from the nested more-menu button.
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onPlay();
          }
        }}
        className="flex cursor-pointer items-center gap-4 border-b border-border/50 px-2 py-2.5 hover:bg-accent/60"
      >
        <span className={cn("w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground", tag.status === "played" && "opacity-55")}>
          {track.episode?.publishedText}
        </span>
        <Thumbnail thumbnails={track.thumbnails} alt="" className={cn("h-[54px] w-24 shrink-0 rounded-sm", tag.status === "played" && "opacity-55")} />
        <div className={cn("min-w-0 flex-1", tag.status === "played" && "opacity-55")}>
          <div className="truncate text-sm">{track.title}</div>
          {tag.status === "started" ? (
            <div className="mt-1.5 h-[3px] w-60 max-w-full bg-border">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {tag.label}
          {tag.chip ? (
            <span className={cn("rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold", tag.status === "played" ? "border-emerald-700/60 text-emerald-400" : "border-border")}>
              {tag.chip}
            </span>
          ) : null}
        </span>
        <TrackMoreMenu item={item} />
      </div>
    </TrackContextMenu>
  );
}
