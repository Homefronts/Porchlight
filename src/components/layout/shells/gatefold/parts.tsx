import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { IconLoader2, IconMicrophoneFilled } from "@tabler/icons-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Thumbnail } from "@/components/shared/thumbnail";
import { ArtworkOutline } from "@/components/shared/artwork-outline";
import { ArtistLinks } from "@/components/shared/artist-links";
import { LikeDislikeButtons } from "@/components/shared/like-buttons";
import { ShelfCard } from "@/components/shared/shelf-card";
import {
  ProgressSlider,
  VolumeControl,
  formatTime,
  repeatLabel,
  useITunesCover,
} from "@/components/layout/player-bar";
import { PlayerCoverMenu } from "@/components/layout/player-cover-menu";
import { PlayerMoreMenu } from "@/components/layout/player-more-menu";
import { QueuePopover } from "@/components/layout/queue-panel";
import {
  LyricsBody,
  LyricsSourceButton,
  useLyricsView,
  type LyricsViewState,
} from "@/components/layout/lyrics-view";
import { recordTitleClass, useLookFamily } from "@/components/theme/look-type";
import { TapeCounter, tapeTime } from "@/components/theme/tape-counter";
import { TransportLabel } from "@/components/theme/transport-label";
import { useHomeFeed } from "@/hooks/use-home-feed";
import { useAiFilter } from "@/lib/ai/use-ai";
import { openFullscreen } from "@/lib/store/fullscreen";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { useScrubStore } from "@/lib/store/scrub";
import { cn } from "@/lib/utils";
import { PopOutButton } from "../panels/parts";
import { Wordmark } from "../index/parts";
import { homePicks } from "./picks";

// Classic leaves --radius-cover unset: today's rounded-md.
const COVER_RADIUS = "rounded-[var(--radius-cover,var(--radius-md))]";
const EYEBROW = "font-meta text-[11px] uppercase tracking-[0.1em]";
// The lyric sheet sets the shared lyrics view a size up, in its own headline face.
const SHEET = "[&_.lyrics-line]:text-[22px] [&_.app-scroll]:text-[22px]";

/**
 * Gatefold's left page: the playing record with its credits, the lyric
 * sheet and the transport. Compact, a slim column with lyrics behind a
 * button. Empty, a blank sleeve and three picks from Home.
 */
export function RecordPage({
  hasTrack,
  compact,
  dial,
}: {
  hasTrack: boolean;
  compact: boolean;
  dial: ReactNode;
}) {
  const eyebrow = hasTrack ? (
    <span className={cn(EYEBROW, "text-acc1")}>● Now playing</span>
  ) : (
    <span className={cn(EYEBROW, "text-muted-foreground")}>○ Nothing playing</span>
  );
  return (
    <section
      aria-label="Now playing"
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col border-e border-w110",
        compact ? "w-[210px] px-5 pb-4 pt-3" : "w-1/2 px-[34px] pb-6 pt-5",
      )}
    >
      {/* The label's corner: the logo with the dial, where it never wraps. */}
      <div
        className={cn(
          "mb-3.5 flex shrink-0",
          compact ? "flex-col items-start gap-3" : "items-center justify-between gap-4",
        )}
      >
        {eyebrow}
        {/* One order in the tree so the dial never remounts at the breakpoint. */}
        <div className={cn(compact && "order-first")}>
          <Wordmark dial={dial} />
        </div>
      </div>
      {hasTrack ? <Playing compact={compact} /> : <EmptySleeve compact={compact} />}
      <Transport compact={compact} />
      {/* The spine's shadow, where the two pages fold. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -end-px w-10 bg-gradient-to-r from-transparent to-k550/40"
      />
    </section>
  );
}

function Playing({ compact }: { compact: boolean }) {
  const track = usePlaybackStore(currentTrack)!;
  const length = usePlaybackStore((s) => s.duration) || track.duration || 0;
  const iTunesCover = useITunesCover(track);
  const lyrics = useLyricsView(track);
  const family = useLookFamily();

  const cover = (
    <PlayerCoverMenu track={track}>
      <button
        type="button"
        aria-label="Open full screen"
        onClick={openFullscreen}
        className={cn(
          "relative isolate shrink-0",
          compact ? "aspect-square w-full" : "size-[clamp(140px,16vw,240px)]",
        )}
      >
        <Thumbnail
          thumbnails={track.thumbnails}
          alt={track.title}
          className={cn("size-full", COVER_RADIUS)}
          targetSize={512}
          highRes
          overrideHighRes={iTunesCover}
        />
        <ArtworkOutline className={COVER_RADIUS} />
      </button>
    </PlayerCoverMenu>
  );
  const title = (
    <span
      className={cn(
        "font-semibold leading-[0.95]",
        compact ? "line-clamp-2 text-2xl" : "line-clamp-3 text-[32px]",
        recordTitleClass(family),
      )}
    >
      {track.title}
    </span>
  );
  const artist = (
    <ArtistLinks
      artists={track.artists}
      fallback={track.subtitle ?? ""}
      className={cn(
        "truncate font-headline italic text-muted-foreground",
        compact ? "text-lg" : "text-2xl",
      )}
    />
  );
  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {cover}
        <div className="flex min-w-0 flex-col gap-1">
          {title}
          {artist}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex shrink-0 gap-[22px]">
        {cover}
        <div className="flex min-w-0 flex-col gap-1.5">
          {title}
          {artist}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-[3px] font-meta text-[11px] uppercase text-muted-foreground">
            {/* Unknown until the stream resolves; no 00:00 placeholder. */}
            {length >= 1 && (
              <>
                <dt>Time</dt>
                <dd>{tapeTime(length)}</dd>
              </>
            )}
            {track.album && (
              <>
                <dt>From</dt>
                <dd className="truncate normal-case">
                  {track.albumId ? (
                    <Link to="/album/$id" params={{ id: track.albumId }} className="hover:text-foreground hover:underline">
                      {track.album}
                    </Link>
                  ) : (
                    track.album
                  )}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between">
          <span className={cn(EYEBROW, "text-muted-foreground/70")}>Lyric sheet</span>
          <LyricsSourceButton state={lyrics} />
        </div>
        <div className={cn("min-h-0 flex-1 overflow-hidden", SHEET)}>
          <LyricsBody state={lyrics} />
        </div>
      </div>
    </>
  );
}

function EmptySleeve({ compact }: { compact: boolean }) {
  const filter = useAiFilter();
  const picks = homePicks(
    useHomeFeed().shelves.map((s) => ({ ...s, items: filter(s.items) })),
  );
  const family = useLookFamily();
  return (
    <div className="app-scroll -me-2 flex min-h-0 flex-1 flex-col overflow-y-auto pe-2">
      <div className={cn("flex gap-[22px]", compact && "flex-col gap-3")}>
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden border-2 border-dashed border-t10 font-meta text-[11px] tracking-[0.1em] text-muted-foreground",
            COVER_RADIUS,
            compact ? "aspect-square w-full" : "size-[clamp(140px,16vw,200px)]",
          )}
        >
          {/* A record peeking out of the empty sleeve. */}
          <div
            aria-hidden
            className="absolute -end-[40%] top-[12%] aspect-square w-4/5 rounded-full border border-t10 opacity-50 bg-[repeating-radial-gradient(circle,var(--k550)_0_2px,transparent_2px_4px)]"
          />
          {/* Bottom corner, clear of the record's rings. */}
          <span className="absolute bottom-3 start-3">EMPTY SLEEVE</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span
            className={cn(
              "font-semibold leading-[0.95]",
              compact ? "text-2xl" : "text-[30px]",
              recordTitleClass(family),
            )}
          >
            Nothing playing yet
          </span>
          <span className={cn("font-headline italic text-muted-foreground", compact ? "text-lg" : "text-[22px]")}>
            Pick something to start
          </span>
        </div>
      </div>
      {picks.length > 0 && (
        <>
          <div className="mb-1 mt-6 flex justify-between border-t border-w110 pt-[7px] font-meta text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
            <span>{picks.length} picks from Home</span>
            {!compact && <span>Tap to play</span>}
          </div>
          <div className={cn("grid gap-1", compact ? "grid-cols-1" : "grid-cols-3")}>
            {picks.map((it) => (
              <ShelfCard key={`${it.kind}:${it.id}`} item={it} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Compact only: the lyric sheet folds behind a button. Crate's deck opens it upward. */
export function LyricsButton({ state, side = "right" }: { state: LyricsViewState; side?: "right" | "top" }) {
  return (
    <Popover>
      <IconTip label="Lyrics">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Lyrics" disabled={!state.hasTrack}>
            <IconMicrophoneFilled />
          </Button>
        </PopoverTrigger>
      </IconTip>
      {/* Opens beside the column, not over the record: anchored to the page's edge. */}
      {side === "right" && <PopoverAnchor className="pointer-events-none absolute inset-y-0 -end-5 w-0" />}
      <PopoverContent
        side={side}
        align="end"
        sideOffset={12}
        className="flex h-[28rem] max-h-[var(--radix-popover-content-available-height)] w-[24rem] flex-col gap-2 p-0"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-hairline px-3 py-2">
          <span className="text-sm font-medium">Lyrics</span>
          <LyricsSourceButton state={state} />
        </header>
        <div className="min-h-0 flex-1 overflow-hidden px-2 pb-3">
          <LyricsBody state={state} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The counter and the controls along the foot of the page (and under Crate's turntable). */
export function Transport({ compact, className }: { compact: boolean; className?: string }) {
  const { playing, status, position, duration, shuffle, repeat } = usePlaybackStore(
    useShallow((s) => ({
      playing: s.playing,
      status: s.status,
      position: s.position,
      duration: s.duration,
      shuffle: s.shuffle,
      repeat: s.repeat,
    })),
  );
  const track = usePlaybackStore(currentTrack);
  const { toggle, next, prev, seek, setShuffle, cycleRepeat } = usePlaybackStore(
    useShallow((s) => ({
      toggle: s.toggle,
      next: s.next,
      prev: s.prev,
      seek: s.seek,
      setShuffle: s.setShuffle,
      cycleRepeat: s.cycleRepeat,
    })),
  );
  const scrub = useScrubStore((s) => s.scrub);
  const setScrub = useScrubStore((s) => s.setScrub);
  const lyrics = useLyricsView(compact ? track : undefined);
  const hasTrack = !!track;
  const loading = status === "loading" && playing;
  const off = !hasTrack || duration <= 0;

  const play = (
    <Button
      size="icon"
      aria-label={playing ? "Pause" : "Play"}
      onClick={toggle}
      disabled={!hasTrack}
      className={cn("shrink-0 rounded-full on-brand bg-brand text-white hover:bg-brand/90", compact ? "size-10" : "size-12")}
    >
      <TransportLabel
        kind={playing ? "pause" : "play"}
        className="size-5"
        spinner={loading ? <IconLoader2 className="animate-spin" /> : null}
      />
    </Button>
  );
  const prevBtn = (
    <Button variant="ghost" size="icon" aria-label="Previous" onClick={prev} disabled={!hasTrack}>
      <TransportLabel kind="prev" />
    </Button>
  );
  const nextBtn = (
    <Button variant="ghost" size="icon" aria-label="Next" onClick={next} disabled={!hasTrack}>
      <TransportLabel kind="next" />
    </Button>
  );

  return (
    <div className={cn("relative mt-4 flex shrink-0 flex-col gap-3", !hasTrack && "[&>*:first-child]:opacity-40", className)}>
      <TapeCounter current={position} total={duration} onSeek={seek} disabled={off} className="mt-0">
        <div className="flex items-center gap-2">
          {!compact && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatTime(scrub ?? position)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <ProgressSlider
              position={position}
              duration={duration}
              scrub={scrub}
              setScrub={setScrub}
              seek={seek}
              disabled={off}
            />
          </div>
          {!compact && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          )}
        </div>
      </TapeCounter>
      {compact ? (
        <>
          <div className="flex items-center justify-between">
            {prevBtn}
            {play}
            {nextBtn}
          </div>
          <div className="flex items-center justify-between">
            <LyricsButton state={lyrics} />
            <QueuePopover />
            <VolumeControl direction="vertical" />
            <PopOutButton hasTrack={hasTrack} />
          </div>
          {/* Its own row: the 210px column has no room left on the one above. */}
          {track ? (
            <div className="flex items-center justify-between">
              <LikeDislikeButtons videoId={track.videoId} track={track} />
              <PlayerMoreMenu track={track} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Shuffle"
            aria-pressed={shuffle}
            onClick={() => setShuffle(!shuffle)}
            className={cn(shuffle && "text-brand")}
          >
            <TransportLabel kind="shuffle" />
          </Button>
          {prevBtn}
          {play}
          {nextBtn}
          <IconTip label={repeatLabel(repeat)}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={repeatLabel(repeat)}
              aria-pressed={repeat !== "off"}
              onClick={cycleRepeat}
              className={cn(repeat !== "off" && "text-brand")}
            >
              <TransportLabel kind={repeat === "one" ? "repeat-one" : "repeat"} />
            </Button>
          </IconTip>
          <div className="ms-auto flex items-center gap-0.5">
            {track ? <LikeDislikeButtons videoId={track.videoId} track={track} /> : null}
            <QueuePopover />
            <VolumeControl direction="vertical" />
            <PlayerMoreMenu track={track} />
            <PopOutButton hasTrack={hasTrack} />
          </div>
        </div>
      )}
    </div>
  );
}
