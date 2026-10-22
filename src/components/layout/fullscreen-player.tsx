import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { fetchLikedSongs } from "@/lib/innertube/library";
import { toggleDisliked, toggleLiked } from "@/lib/like-actions";
import { useDislikesStore } from "@/lib/store/dislikes";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  ShuffleIcon,
  RepeatIcon,
  Repeat1Icon,
  Loader2Icon,
} from "lucide-react";
import { IconArrowsMinimize } from "@tabler/icons-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArtworkOutline } from "@/components/shared/artwork-outline";
import { ArtistLinks } from "@/components/shared/artist-links";
import { EntityLink } from "@/components/shared/entity-link";
import { getLikedIdsSet } from "@/components/shared/like-buttons";
import { Thumbnail } from "@/components/shared/thumbnail";
import { LyricsBody, useLyricsView } from "@/components/layout/lyrics-view";
import {
  ProgressSlider,
  SourceToggle,
  VolumeControl,
  formatTime,
  repeatLabel,
  useITunesCover,
} from "@/components/layout/player-bar";
import { MusicVideo, stageSwitch, useMusicVideoId, vlog } from "@/components/layout/music-video";
import { PlayerMoreMenu } from "@/components/layout/player-more-menu";
import { QueuePopover } from "@/components/layout/queue-panel";
import { LyricsSourceButton } from "@/components/layout/lyrics-view";
import { cn } from "@/lib/utils";
import { useFullscreenStore } from "@/lib/store/fullscreen";
import { usePlaybackStore, currentTrack } from "@/lib/store/playback";
import { useScrubStore } from "@/lib/store/scrub";
import { useSettingsStore, type FullscreenLayout } from "@/lib/store/settings";
import type { QueueTrack } from "@/lib/store/playback";

/**
 * The full-screen now-playing view, per the design handoff: the cover
 * blurred across the whole window with a scrim, a layout switch and an
 * Exit pill on top, one of three bodies in the middle (the cover
 * centred, the cover beside the lyrics, or the art itself with the
 * title over it) and the transport along the bottom.
 *
 * Mounted once in AppShell; the store decides whether it shows. It sits
 * under the title bar (the window controls stay reachable) and under
 * every dialog, so Settings can open on top of it. The lyrics column
 * reuses the player card's own `LyricsBody`, only set larger.
 */
export function FullscreenPlayer() {
  const open = useFullscreenStore((s) => s.open);
  const setOpen = useFullscreenStore((s) => s.setOpen);
  const track = usePlaybackStore(currentTrack);

  // Nothing to show once the queue is cleared underneath it.
  useEffect(() => {
    if (open && !track) setOpen(false);
  }, [open, track, setOpen]);

  return (
    <AnimatePresence>
      {open && track ? <FullscreenView key="fullscreen" track={track} /> : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome shared by the buttons on the blurred surface                 */
/* ------------------------------------------------------------------ */

/** 34px chip: the design's footer button, on the full-screen surface.
 *  Colours spelled as `[color:…]` so tailwind-merge can pair them with
 *  the button's own text colour and let these win. */
const chip =
  "size-[34px] rounded-[9px] bg-w080 text-[color:var(--fs-txt2)] hover:bg-w160 hover:text-[color:var(--fs-title)] [&_svg]:size-4";

/** The transport's outer pair (shuffle / repeat), 40px, tinted when on. */
const sideButton = (on: boolean) =>
  cn(
    "size-10 rounded-[11px] transition-colors duration-[140ms] hover:bg-w140 [&_svg]:size-[19px]",
    on
      ? "bg-[rgba(var(--acc1rgb),0.16)] text-acc1 hover:text-acc1"
      : "text-(--fs-txt3) hover:text-(--fs-title)",
  );

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

function FullscreenView({ track }: { track: QueueTrack }) {
  const setOpen = useFullscreenStore((s) => s.setOpen);
  const layout = useSettingsStore((s) => s.fullscreenLayout);
  const setLayout = useSettingsStore((s) => s.setFullscreenLayout);
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";

  const { playing, status, position, duration, shuffle, repeat } =
    usePlaybackStore(
      useShallow((s) => ({
        playing: s.playing,
        status: s.status,
        position: s.position,
        duration: s.duration,
        shuffle: s.shuffle,
        repeat: s.repeat,
      })),
    );
  const toggle = usePlaybackStore((s) => s.toggle);
  const next = usePlaybackStore((s) => s.next);
  const prev = usePlaybackStore((s) => s.prev);
  const seek = usePlaybackStore((s) => s.seek);
  const setShuffle = usePlaybackStore((s) => s.setShuffle);
  const cycleRepeat = usePlaybackStore((s) => s.cycleRepeat);
  const scrub = useScrubStore((s) => s.scrub);
  const setScrub = useScrubStore((s) => s.setScrub);
  const loading = status === "loading" && playing;

  const iTunesCover = useITunesCover(track);
  const videoId = useMusicVideoId(track);
  // Reduce Motion: layouts appear without fading in.
  const fadeIn = useReducedMotion() ? {} : FADE_IN;
  // Where the VideoStage sits: the view, and in the boxed layouts the Cover frame.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const lyricsState = useLyricsView(track);
  // "With lyrics" only means something when there are some. A track the
  // sources came back empty for shows as Centered instead; the setting
  // itself is untouched, so the next track with lyrics gets them again.
  const noLyrics =
    lyricsState.hasTrack && !lyricsState.isLoading && !lyricsState.active;
  const shown: FullscreenLayout =
    layout === "lyrics" && noLyrics ? "cover" : layout;

  // Escape closes the view, unless a dialog, menu or popover on top of
  // it took the key first (Radix marks those keydowns as handled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const immersive = shown === "immersive";
  // The cover layouts wash the art out under a heavy blur. Immersive
  // keeps it sharp in the middle and blurs only the top and bottom bands
  // (below), where the chrome and the title sit. Light theme brightens
  // instead of darkening.
  const filter = immersive
    ? light
      ? "saturate(1.05) brightness(1.05)"
      : "saturate(1.18) brightness(0.72)"
    : light
      ? "blur(46px) saturate(0.95) brightness(1.34)"
      : "blur(46px) saturate(1.3) brightness(0.62)";

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={0}>
      <motion.div
        ref={setHost}
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background"
      >
        {/* Backdrop: the cover, oversized so the blur has no soft edge.
            An <img> through Thumbnail rather than a CSS background: the
            Google image CDNs answer a request that carries our Referer
            with an HTML stub, and only <img> can send none. */}
        <div
          aria-hidden
          className="absolute inset-[-8%] scale-110 transition-[filter] duration-500"
          style={{ filter }}
        >
          <Thumbnail
            thumbnails={track.thumbnails}
            alt=""
            className="size-full rounded-none bg-transparent"
            targetSize={1024}
            highRes
            overrideHighRes={iTunesCover}
          />
        </div>
        {/* The blur bands soften art behind the chrome; a video stays sharp. */}
        {immersive && !videoId ? (
          <>
            {/* Blur bands: strongest at the edges, gone by mid-height. */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1/2 [backdrop-filter:blur(28px)] [mask-image:linear-gradient(to_bottom,black_0%,black_12%,transparent_100%)]"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1/2 [backdrop-filter:blur(28px)] [mask-image:linear-gradient(to_top,black_0%,black_12%,transparent_100%)]"
            />
          </>
        ) : null}
        {/* Two shades that crossfade on a layout switch: the dim one sits under
            a boxed video (it dims the backdrop, not the video), the gradient
            over a full-screen one (it keeps the title readable). */}
        <div
          aria-hidden
          className="absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none"
          style={{ background: "var(--g9d)", opacity: immersive ? 0 : 1 }}
        />
        {videoId ? (
          <VideoStage track={track} override={iTunesCover} host={host} slot={slot} immersive={immersive} />
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none"
          style={{
            background: "linear-gradient(180deg, var(--g9a) 0%, var(--g9b) 34%, var(--g9c) 100%)",
            opacity: immersive ? 1 : 0,
          }}
        />

        {/* The title bar is transparent and stays on top, so the body
            starts below it and the cover runs up behind it. */}
        <div className="relative flex min-h-0 flex-1 flex-col px-7 pb-6 pt-[calc(var(--titlebar-h)+8px)]">
          {/* Top row: layout switch, Exit. */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div
              role="radiogroup"
              aria-label="Full screen layout"
              className="flex gap-0.5 rounded-[10px] border border-w080 bg-w070 p-[3px]"
            >
              {LAYOUTS.map(({ value, label, Icon }) => {
                const on = shown === value;
                return (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={label}
                        onClick={() => setLayout(value)}
                        className={cn(
                          "grid h-7 w-[30px] cursor-pointer place-items-center rounded-[7px] transition-colors duration-[160ms] hover:text-(--fs-title)",
                          on
                            ? "bg-w160 text-(--fs-title) shadow-[0_1px_2px_var(--k300)]"
                            : "text-(--fs-seg)",
                        )}
                      >
                        <Icon />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-[34px] cursor-pointer items-center gap-2 rounded-[9px] bg-w080 px-[13px] text-(--fs-txt2) transition-colors duration-[140ms] hover:bg-w160 hover:text-(--fs-title)"
            >
              <IconArrowsMinimize className="size-[15px]" stroke={1.9} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">
                Exit fullscreen
              </span>
            </button>
          </div>

          {/* Body, one of three. */}
          {shown === "cover" ? (
            <motion.div {...fadeIn} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[26px] py-2.5">
              <Cover
                track={track}
                override={iTunesCover}
                className={cn(
                  // A music video plays wide; the cover stays square.
                  videoId ? "w-[min(880px,76vw)]" : "w-[300px]",
                  "rounded-[14px] shadow-[0_40px_80px_-28px_var(--k900),inset_0_0_0_1px_var(--w140)]",
                )}
                onSlot={setSlot}
              />
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-[34px] font-bold leading-tight tracking-[-0.03em] text-(--fs-title)">
                  {track.title}
                </span>
                <Subtitle track={track} className="text-[15px]" />
              </div>
            </motion.div>
          ) : null}

          {shown === "lyrics" ? (
            <motion.div {...fadeIn} className="mx-auto flex min-h-0 w-full max-w-[1020px] flex-1 items-center gap-14 py-3.5">
              <div className="flex w-[340px] shrink-0 flex-col gap-5">
                <Cover
                  track={track}
                  override={iTunesCover}
                  className="w-full rounded-xl shadow-[0_30px_60px_-26px_var(--k900),inset_0_0_0_1px_var(--w140)]"
                  onSlot={setSlot}
                />
                <div className="flex min-w-0 flex-col gap-[7px]">
                  <span className="truncate text-[27px] font-bold leading-tight tracking-[-0.025em] text-(--fs-title)">
                    {track.title}
                  </span>
                  <Subtitle track={track} className="truncate text-sm" />
                </div>
              </div>
              {/* Shorter than the cover column on purpose: a few lines
                  either side of the active one, centred on the cover. */}
              <div className="relative h-[min(400px,100%)] min-w-0 flex-1 overflow-hidden">
                <LyricsBody state={lyricsState} large />
              </div>
            </motion.div>
          ) : null}

          {immersive ? (
            <motion.div {...fadeIn} className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 pb-5 pt-3.5">
              <span className="text-[56px] font-bold leading-[1.02] tracking-[-0.035em] text-(--fs-title) [text-wrap:pretty]">
                {track.title}
              </span>
              <Subtitle track={track} className="text-[17px]" />
            </motion.div>
          ) : null}

          {/* Bottom: progress, then the transport with the side clusters. */}
          <div className="flex shrink-0 flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <span className="w-[38px] shrink-0 font-mono text-xs text-(--fs-time)">
                {formatTime(scrub ?? position)}
              </span>
              <div className="min-w-0 flex-1">
                <ProgressSlider
                  position={position}
                  duration={duration}
                  scrub={scrub}
                  setScrub={setScrub}
                  seek={seek}
                  disabled={duration <= 0}
                />
              </div>
              <span className="w-[38px] shrink-0 text-right font-mono text-xs text-(--fs-time)">
                {formatTime(duration)}
              </span>
            </div>
            <div className="relative flex items-center justify-center gap-3">
              <div className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
                <LikePill track={track} />
                <VolumeControl className={chip} />
              </div>
              <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
                <SourceToggle track={track} />
                <LyricsSourceButton state={lyricsState} className={chip} />
                <QueuePopover className={chip} />
                <PlayerMoreMenu
                  track={track}
                  includeSource={false}
                  className={chip}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                aria-label="Shuffle"
                aria-pressed={shuffle}
                onClick={() => setShuffle(!shuffle)}
                className={sideButton(shuffle)}
              >
                <ShuffleIcon className="size-[19px]" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous"
                onClick={prev}
                className={ghostButton}
              >
                <SkipBackIcon className="size-[22px] fill-current" />
              </Button>
              <Button
                size="icon"
                aria-label={playing ? "Pause" : "Play"}
                onClick={toggle}
                className="mx-1.5 size-16 rounded-full text-white shadow-[0_6px_20px_-4px_rgba(var(--acc1rgb),0.28),inset_0_1px_1px_var(--w220)] transition-[filter,box-shadow] duration-[140ms] hover:brightness-[1.16] hover:shadow-[0_10px_28px_-6px_rgba(var(--acc1rgb),0.36),inset_0_1px_1px_var(--w260)]"
                style={{
                  background:
                    "radial-gradient(circle at 50% 30%, var(--acc5), var(--acc1) 58%)",
                }}
              >
                {/* Sized on the glyphs themselves: the button's own
                    `[&_svg]` rule only yields to an explicit size-*. */}
                {loading ? (
                  <Loader2Icon className="size-[26px] animate-spin" />
                ) : playing ? (
                  <PauseIcon className="size-[26px] fill-current" />
                ) : (
                  <PlayIcon className="ml-0.5 size-[26px] fill-current" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next"
                onClick={next}
                className={ghostButton}
              >
                <SkipForwardIcon className="size-[22px] fill-current" />
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={repeatLabel(repeat)}
                    aria-pressed={repeat !== "off"}
                    onClick={cycleRepeat}
                    className={sideButton(repeat !== "off")}
                  >
                    {repeat === "one" ? (
                      <Repeat1Icon className="size-[19px]" />
                    ) : (
                      <RepeatIcon className="size-[19px]" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{repeatLabel(repeat)}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}

/** Prev / next: 44px, bare until hovered. */
const ghostButton =
  "size-11 rounded-xl text-[color:var(--fs-txt)] hover:bg-w140 hover:text-[color:var(--fs-title)]";

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The design's like pill: glyph plus "Liked" / "Like", tinted with the
 * accent while liked. Follows Appearance -> Rating buttons the way the
 * row buttons do, so with thumbs on it grows a thumbs-down chip too.
 */
function LikePill({ track }: { track: QueueTrack }) {
  const qc = useQueryClient();
  const both = useSettingsStore((s) => s.ratingButtons === "both");
  const isDisliked = useDislikesStore((s) => !!s.ids[track.videoId]);
  const liked = useQuery({
    queryKey: ["liked-songs"],
    queryFn: () => fetchLikedSongs(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const isLiked = getLikedIdsSet(liked.data).has(track.videoId);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  const LikeIcon = both ? ThumbsUpIcon : HeartIcon;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-pressed={isLiked}
        onClick={() =>
          run(() =>
            toggleLiked({
              queryClient: qc,
              videoId: track.videoId,
              wasLiked: isLiked,
              track,
            }),
          )
        }
        className={cn(
          "flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[9px] px-[13px] text-[12.5px] font-semibold tracking-[-0.005em] transition-colors duration-[140ms] hover:bg-w140",
          isLiked
            ? "bg-[rgba(var(--acc1rgb),0.14)] text-acc1 hover:bg-[rgba(var(--acc1rgb),0.2)]"
            : "bg-w070 text-[color:var(--fs-txt2)]",
        )}
      >
        <LikeIcon
          className={cn("size-4", isLiked && "fill-current")}
          strokeWidth={1.9}
        />
        {isLiked ? "Liked" : "Like"}
      </button>
      {both ? (
        <button
          type="button"
          disabled={busy}
          aria-label={isDisliked ? "Remove dislike" : "Dislike"}
          aria-pressed={isDisliked}
          onClick={() =>
            run(() =>
              toggleDisliked({
                queryClient: qc,
                videoId: track.videoId,
                wasDisliked: isDisliked,
                wasLiked: isLiked,
                track,
              }),
            )
          }
          className={cn(
            "grid size-[34px] cursor-pointer place-items-center rounded-[9px] transition-colors duration-[140ms] hover:bg-w160",
            isDisliked
              ? "bg-w160 text-[color:var(--fs-title)]"
              : "bg-w080 text-[color:var(--fs-txt2)]",
          )}
        >
          <ThumbsDownIcon
            className={cn("size-4", isDisliked && "fill-current")}
            strokeWidth={1.9}
          />
        </button>
      ) : null}
    </>
  );
}

/** A layout's body fades in as the video morphs into place, so the switch reads as one move. */
const FADE_IN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] },
} as const;

function Cover({
  track,
  override,
  className,
  onSlot,
}: {
  track: QueueTrack;
  override: string | null;
  className?: string;
  /** Video mode: this box is only a frame, and the VideoStage sits on it. */
  onSlot: (el: HTMLDivElement | null) => void;
}) {
  const video = !!useMusicVideoId(track);
  if (video) {
    return (
      <div ref={onSlot} className={cn("relative isolate aspect-video shrink-0", className)}>
        <ArtworkOutline className="rounded-[inherit]" />
      </div>
    );
  }
  return (
    <div className={cn("relative isolate aspect-square shrink-0", className)}>
      <Thumbnail
        thumbnails={track.thumbnails}
        alt={track.title}
        className="pointer-events-none size-full rounded-[inherit]"
        targetSize={1024}
        highRes
        overrideHighRes={override}
      />
      <ArtworkOutline className="rounded-[inherit]" />
    </div>
  );
}

type StageBox = { left: number; top: number; width: number; height: number; radius: string };

const SWITCH = { duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const;

/** The frame the video is showing right now, drawn on a canvas (null if there's none to take). */
function snapshot(stage: HTMLElement | null): HTMLCanvasElement | null {
  const v = stage?.querySelector<HTMLVideoElement>("video[data-front]");
  if (!v || v.readyState < 2 || !v.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = Math.min(v.videoWidth, 1280);
  c.height = Math.round((c.width * v.videoHeight) / v.videoWidth);
  try {
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c; // shown as is: no image encoding at the moment of the switch
  } catch {
    return null; // not readable: just skip the crossfade
  }
}

/**
 * Fullscreen's one music video, kept mounted across the three layouts so
 * switching never reloads it. Centred and With lyrics mark where it goes with
 * an empty Cover frame (`slot`), and it sits exactly on that frame, corners
 * included; Immersive has no frame, so it fills the view. The cover shows
 * under the video until its first frame.
 *
 * A layout switch crossfades instead of sliding: a snapshot of the frame on
 * screen fades out where the video was, while the live video, still playing
 * and already in its new frame, fades and scales in. It runs when the video's
 * destination exists (`target`: the new frame, or the view for Immersive),
 * not when the layout name changes: a new layout's frame reports itself a
 * render later, and starting before that showed the video in the wrong place
 * (full screen, or a removed frame's zero box) and then popping.
 */
function VideoStage({
  track,
  override,
  host,
  slot,
  immersive,
}: {
  track: QueueTrack;
  override: string | null;
  host: HTMLElement | null;
  slot: HTMLElement | null;
  immersive: boolean;
}) {
  const [box, setBox] = useState<StageBox | null>(null);
  const [ghost, setGhost] = useState<{ id: number; canvas: HTMLCanvasElement; box: StageBox | null } | null>(null);
  const [stage, animate] = useAnimate<HTMLDivElement>();
  const reduce = useReducedMotion();
  const boxRef = useRef<StageBox | null>(null);
  // Where the video goes; null while a boxed layout's frame hasn't reported yet.
  const target = immersive ? "immersive" : (slot?.isConnected ? slot : null);
  const lastTarget = useRef(target);

  // Effects run in this order within a commit: remember the box on screen,
  // then on arriving at a new target snapshot it, then move to the target.
  useLayoutEffect(() => {
    boxRef.current = box;
  });

  useLayoutEffect(() => {
    const step = stageSwitch(lastTarget.current, target);
    if (step === "none") return;
    lastTarget.current = target;
    if (step === "first" || reduce) return; // Reduce Motion: a plain cut
    const canvas = snapshot(stage.current);
    vlog(`fullscreen: switch to ${immersive ? "immersive" : "frame"}, snapshot ${canvas ? "taken" : "skipped"}`);
    if (canvas) setGhost({ id: Date.now(), canvas, box: boxRef.current });
    if (stage.current) void animate(stage.current, { opacity: [0, 1], scale: [0.96, 1] }, SWITCH);
  }, [target, immersive, animate, stage, reduce]);

  useLayoutEffect(() => {
    if (immersive) return setBox(null);
    if (!target || !host || !(target instanceof HTMLElement)) return; // waiting for the frame: stay put
    const frame = target;
    const radius = getComputedStyle(frame).borderRadius; // fixed per frame: read once, not every animation frame
    // The frame can move without resizing (lyrics load beside it, a title
    // wraps), which no observer reports, so follow it every frame; it's one
    // rect read, and state only changes when the frame did.
    let last = "";
    let raf = 0;
    const follow = () => {
      if (frame.isConnected) {
        const h = host.getBoundingClientRect();
        const r = frame.getBoundingClientRect();
        // The view's open animation scales it; divide that out to get its own pixels.
        const k = host.offsetWidth ? h.width / host.offsetWidth : 1;
        const next = { left: (r.left - h.left) / k, top: (r.top - h.top) / k, width: r.width / k, height: r.height / k, radius };
        const key = `${next.left.toFixed(1)}|${next.top.toFixed(1)}|${next.width.toFixed(1)}|${next.height.toFixed(1)}`;
        if (key !== last) {
          last = key;
          setBox(next);
        }
      }
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [target, host, immersive]);

  const place = (b: StageBox | null) =>
    b ? { left: b.left, top: b.top, width: b.width, height: b.height, borderRadius: b.radius } : { left: 0, top: 0, width: "100%", height: "100%", borderRadius: 0 };
  // A boxed layout before its frame first reports: don't flash full screen.
  const waiting = !immersive && !box;

  return (
    <>
      <div
        ref={stage}
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{ ...place(box), visibility: waiting ? "hidden" : undefined }}
      >
        {box ? (
          <Thumbnail
            thumbnails={track.thumbnails}
            alt=""
            className="mx-auto aspect-square h-full rounded-none bg-transparent"
            targetSize={1024}
            highRes
            overrideHighRes={override}
          />
        ) : null}
        <MusicVideo track={track} where="fullscreen" className={box ? "rounded-none" : "rounded-none object-cover"} />
      </div>
      {ghost ? (
        <motion.div
          key={ghost.id}
          aria-hidden
          ref={(el: HTMLDivElement | null) => {
            if (el && !el.firstChild) el.append(ghost.canvas);
          }}
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 1.03 }}
          transition={SWITCH}
          onAnimationComplete={() => setGhost(null)}
          className={cn(
            "pointer-events-none absolute overflow-hidden bg-black [&>canvas]:size-full",
            ghost.box ? "[&>canvas]:object-contain" : "[&>canvas]:object-cover",
          )}
          style={place(ghost.box)}
        />
      ) : null}
    </>
  );
}

/**
 * Artist line, with the album after a dot when the track has one. Both
 * link through like the player card's; following one lands on a page
 * under this view, so the view closes as the link is taken.
 */
function Subtitle({
  track,
  className,
}: {
  track: QueueTrack;
  className?: string;
}) {
  const setOpen = useFullscreenStore((s) => s.setOpen);
  return (
    <span
      className={cn("text-(--fs-sub)", className)}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) setOpen(false);
      }}
    >
      <ArtistLinks artists={track.artists} fallback={track.subtitle ?? ""} />
      {track.album ? (
        <>
          {track.artists?.length || track.subtitle ? " · " : null}
          {track.albumId ? (
            <EntityLink to="/album/$id" id={track.albumId} event="nav:album">
              {track.album}
            </EntityLink>
          ) : (
            track.album
          )}
        </>
      ) : null}
    </span>
  );
}

/* The layout switch's three glyphs, drawn as in the design. */

function CoverGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect
        x="9.5"
        y="8"
        width="5"
        height="5"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
      <path d="M9 16h6" strokeLinecap="round" />
    </svg>
  );
}

function LyricsGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect
        x="6"
        y="8"
        width="4.5"
        height="4.5"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
      <path d="M13 9h5M13 12h5M13 15h3" strokeLinecap="round" />
    </svg>
  );
}

function ImmersiveGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
        fill="currentColor"
        fillOpacity="0.34"
      />
      <path d="M6.5 16h7M6.5 12.8h4" strokeLinecap="round" />
    </svg>
  );
}

const LAYOUTS: {
  value: FullscreenLayout;
  label: string;
  Icon: () => React.JSX.Element;
}[] = [
  { value: "cover", label: "Centered", Icon: CoverGlyph },
  { value: "lyrics", label: "With lyrics", Icon: LyricsGlyph },
  { value: "immersive", label: "Immersive art", Icon: ImmersiveGlyph },
];
