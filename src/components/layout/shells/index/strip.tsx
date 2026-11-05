import type { ReactNode } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Thumbnail } from "@/components/shared/thumbnail";
import { ArtistLinks } from "@/components/shared/artist-links";
import { useITunesCover, VolumeControl } from "@/components/layout/player-bar";
import { PlayerCoverMenu } from "@/components/layout/player-cover-menu";
import { PlayerMoreMenu } from "@/components/layout/player-more-menu";
import { LikeDislikeButtons } from "@/components/shared/like-buttons";
import { MusicVideo } from "@/components/layout/music-video";
import { QueueBody, RadioToggleButton } from "@/components/layout/queue-panel";
import {
  LyricsBody,
  LyricsSourceButton,
  useLyricsView,
} from "@/components/layout/lyrics-view";
import { recordTitleClass, useLookFamily } from "@/components/theme/look-type";
import { tapeTime } from "@/components/theme/tape-counter";
import { TransportLabel } from "@/components/theme/transport-label";
import { openFullscreen } from "@/lib/store/fullscreen";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { useScrubStore } from "@/lib/store/scrub";
import { usePlatter } from "@/components/theme/use-platter";
import { cn } from "@/lib/utils";
import { PopOutButton } from "../panels/parts";

// Every button on the label inverts with it instead of the ghost grey hover; links keep the label ink on hover.
const ON_LABEL =
  "[&_button]:text-on-strip [&_button:hover]:bg-on-strip/15 [&_button:hover]:text-on-strip [&_button[aria-pressed=true]]:text-brand [&_a:hover]:text-on-strip";
const WORD = "h-8 px-2 font-meta text-[11px] tracking-[0.12em]";

/** Two reels in a box; they turn while the tape plays. */
function Reel({ playing }: { playing: boolean }) {
  const ref = usePlatter<HTMLElement>(2400, playing);
  return <i ref={ref} className="size-3 rounded-full border-2 border-dashed border-on-strip" />;
}

function Cassette({ on, playing }: { on: boolean; playing: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-9 w-14 shrink-0 items-center justify-around rounded-[4px] border-2 border-on-strip",
        !on && "opacity-40",
      )}
    >
      <Reel playing={playing} />
      <Reel playing={playing} />
    </div>
  );
}

/** Seek line in the label's ink; drags go through the shared scrub store, like the bar's. */
function Counter({ thin }: { thin: boolean }) {
  const { position, duration } = usePlaybackStore(
    useShallow((s) => ({ position: s.position, duration: s.duration })),
  );
  const seek = usePlaybackStore((s) => s.seek);
  const scrub = useScrubStore((s) => s.scrub);
  const setScrub = useScrubStore((s) => s.setScrub);
  const disabled = duration <= 0;
  const shown = scrub ?? position;
  return (
    <div className="flex min-w-16 flex-1 items-center gap-2.5 font-meta text-[11px] tabular-nums">
      {!thin && <span>{tapeTime(shown)}</span>}
      <SliderPrimitive.Root
        value={[shown]}
        max={Math.max(duration, 1)}
        step={1}
        disabled={disabled}
        onValueChange={([v]) => setScrub(v)}
        onValueCommit={([v]) => {
          seek(v);
          setScrub(null);
        }}
        className="relative flex h-4 flex-1 cursor-pointer touch-none items-center select-none data-[disabled]:cursor-default"
      >
        <SliderPrimitive.Track className="relative h-0.5 grow bg-on-strip/25">
          <SliderPrimitive.Range className="absolute h-full bg-on-strip" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="Seek"
          aria-valuetext={`${tapeTime(shown)} of ${tapeTime(duration)}`}
          className={cn(
            "block size-2 rounded-full bg-on-strip outline-none focus-visible:ring-2 focus-visible:ring-on-strip",
            disabled && "invisible",
          )}
        />
      </SliderPrimitive.Root>
      {!thin && <span>{tapeTime(duration)}</span>}
    </div>
  );
}

function WordPopover({
  label,
  disabled,
  children,
  className,
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  className: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" disabled={disabled} className={WORD}>
          {label.toUpperCase()}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={10} className={className}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Index's player: a bright cassette label across the top, in the look's
 * ink with its ground for type. Empty, it reads "Nothing on the tape".
 */
export function IndexStrip({ hasTrack, compact }: { hasTrack: boolean; compact: boolean }) {
  const track = usePlaybackStore(currentTrack);
  const { playing, status } = usePlaybackStore(
    useShallow((s) => ({ playing: s.playing, status: s.status })),
  );
  const toggle = usePlaybackStore((s) => s.toggle);
  const next = usePlaybackStore((s) => s.next);
  const prev = usePlaybackStore((s) => s.prev);
  const iTunesCover = useITunesCover(track);
  const lyrics = useLyricsView(track);
  const family = useLookFamily();
  const loading = status === "loading" && playing;

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={0}>
      <section
        aria-label="Player"
        className={cn(
          "relative z-10 flex shrink-0 items-center gap-[18px] bg-strip py-3 text-on-strip",
          compact ? "px-4" : "px-[26px]",
          ON_LABEL,
        )}
      >
        <Cassette on={hasTrack} playing={hasTrack && playing} />
        {track ? (
          <PlayerCoverMenu track={track}>
            <button
              type="button"
              aria-label="Open full screen"
              onClick={openFullscreen}
              className="relative size-10 shrink-0"
            >
              <Thumbnail
                thumbnails={track.thumbnails}
                alt={track.title}
                className="size-full"
                targetSize={128}
                highRes
                overrideHighRes={iTunesCover}
              />
              <MusicVideo track={track} where="card" />
            </button>
          </PlayerCoverMenu>
        ) : (
          <div className="size-10 shrink-0 border-2 border-dashed border-on-strip/30" />
        )}
        <div className={cn("flex min-w-0 flex-col gap-0.5", compact ? "w-56" : "w-60")}>
          <span
            className={cn(
              "truncate font-bold",
              compact ? "text-base/none" : "text-lg/none",
              track && recordTitleClass(family),
            )}
          >
            {track?.title ?? "Nothing on the tape"}
          </span>
          {track ? (
            <ArtistLinks
              artists={track.artists}
              fallback={track.subtitle ?? ""}
              className="truncate font-headline text-base italic leading-tight"
            />
          ) : (
            <span className="truncate font-headline text-base italic leading-tight opacity-60">
              Pick a record to start
            </span>
          )}
        </div>
        <Counter thin={compact} />
        <div className={cn("flex shrink-0 items-center gap-0.5", !hasTrack && "opacity-60")}>
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={prev} disabled={!hasTrack}>
            <TransportLabel kind="prev" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
            disabled={!hasTrack}
          >
            <TransportLabel
              kind={playing ? "pause" : "play"}
              spinner={loading ? <IconLoader2 className="animate-spin" /> : null}
            />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={next} disabled={!hasTrack}>
            <TransportLabel kind="next" />
          </Button>
          <WordPopover
            label="Lyrics"
            disabled={!hasTrack}
            className="flex h-[28rem] w-[24rem] flex-col gap-2 p-0"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-hairline px-3 py-2">
              <span className="text-sm font-medium">Lyrics</span>
              <LyricsSourceButton state={lyrics} />
            </header>
            <div className="min-h-0 flex-1 overflow-hidden px-2 pb-3">
              <LyricsBody state={lyrics} />
            </div>
          </WordPopover>
          <WordPopover label="Queue" className="flex h-[28rem] w-[28rem] flex-col p-0">
            <QueueBody />
          </WordPopover>
          <RadioToggleButton />
          <VolumeControl direction="vertical" />
          {track ? (
            <>
              <LikeDislikeButtons videoId={track.videoId} track={track} />
              <PlayerMoreMenu track={track} />
            </>
          ) : null}
          <PopOutButton hasTrack={hasTrack} />
        </div>
      </section>
    </TooltipProvider>
  );
}
