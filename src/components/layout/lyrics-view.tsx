import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ChangeEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconCheck, IconRefresh } from "@tabler/icons-react";
import { IconMicrophoneFilled } from "@tabler/icons-react";
import { playerIconButton } from "@/components/layout/player-chrome";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Lyrics, TimedLine } from "@/lib/lyrics/types";
import { useLyricsSources } from "@/lib/lyrics/sources";
import type { Availability } from "@/lib/lyrics/pick";
import { useEnrichedLyrics } from "@/lib/lyrics/enrich";
import { lineAlign, wordFill } from "@/lib/lyrics/word-fill";
import {
  loadLyricsFile,
  removeLyricsFile,
  saveLyricsFile,
} from "@/lib/lyrics/user-files";
import {
  availabilityBadge,
  extrapolate,
  findActiveIdx,
  firstAgentOf,
  shouldRetryPick,
  singerLabelAt,
} from "@/components/layout/lyrics-view-words";
import {
  enabledSources,
  SOURCE_LABELS,
  TARGET_LANGS,
  useLyricsSettings,
  type LyricsSource,
} from "@/lib/store/lyrics-settings";
import { usePlaybackStore } from "@/lib/store/playback";
import type { QueueTrack } from "@/lib/store/playback";
import { useScrubStore } from "@/lib/store/scrub";
import { useLookFamily } from "@/components/theme/look-type";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Pref = LyricsSource | "auto";

// The old global pin; per-song picks replace it.
try {
  localStorage.removeItem("ytm:lyrics-source");
} catch {
  /* noop */
}

export type LyricsViewState = {
  videoId: string | undefined;
  active: Lyrics | null;
  isLoading: boolean;
  hasTrack: boolean;
  pref: Pref;
  setPref: (p: Pref) => void;
  best: LyricsSource | null;
  availability: Record<LyricsSource, Availability>;
  /** Sources that failed to answer at all. */
  failed: LyricsSource[];
  /** A retry is in flight. */
  isRetrying: boolean;
  retryFailed: () => void;
};

/**
 * Drives the inline lyrics panel: fires queries to all three sources,
 * tracks the user's source preference, and exposes a render-ready
 * state. Auto-pick rule: any timed source > any plain source, ordered
 * by the user's source order.
 *
 * Used by the player bar to render `<LyricsBody>` (the flowing area)
 * and `<LyricsSourceButton>` (the mic-icon dropdown) from the same
 * state — without running the underlying queries twice.
 */
export function useLyricsView(track: QueueTrack | undefined): LyricsViewState {
  const videoId = track?.videoId;
  const pref: Pref = useLyricsSettings((s) =>
    videoId ? (s.perSong[videoId] ?? "auto") : "auto",
  );
  const pickForSong = useLyricsSettings((s) => s.pickForSong);

  const {
    queries,
    availability,
    best,
    isLoading,
    failed,
    isRetrying,
    retryFailed,
  } = useLyricsSources(track, !!track);

  const setPref = (p: Pref) => {
    if (videoId) pickForSong(videoId, p === "auto" ? null : p);
    // The pick alone falls back to auto while the source has nothing, so ask it again.
    if (shouldRetryPick(p, availability)) void queries[p].refetch();
  };

  // `best` already applies the song pick, falling back to auto when it has nothing.
  const activeSource = best;
  const active = useEnrichedLyrics(
    activeSource ? (queries[activeSource].data ?? null) : null,
    videoId,
  );

  return {
    videoId,
    active,
    isLoading,
    hasTrack: !!track,
    pref,
    setPref,
    best,
    availability,
    failed,
    isRetrying,
    retryFailed,
  };
}

export function LyricsBody({
  state,
  large = false,
}: {
  state: LyricsViewState;
  /** Full-screen sizing: bigger type, same motion. */
  large?: boolean;
}) {
  const t = useT();
  if (!state.hasTrack) return null;
  if (state.isLoading && !state.active) {
    return (
      <p className="px-4 py-2 text-sm text-muted-foreground">{t("player.lyrics.loading")}</p>
    );
  }
  if (!state.active) {
    // A source that never answered is not a track without lyrics. Say which
    // it was and offer another go, rather than the flat "No lyrics found."
    // that used to cover both and then sat in the disk cache for 24h.
    if (state.failed.length > 0) {
      return (
        <div className="flex flex-col items-start gap-2 px-4 py-2">
          <p className="text-sm text-muted-foreground">
            {t("player.lyrics.couldntReach", { sources: state.failed.map((s) => SOURCE_LABELS[s]).join(", ") })}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={state.retryFailed}
            disabled={state.isRetrying}
          >
            <IconRefresh className={state.isRetrying ? "animate-spin" : ""} />
            {state.isRetrying ? t("player.lyrics.trying") : t("player.lyrics.tryAgain")}
          </Button>
        </div>
      );
    }
    return (
      <p className="px-4 py-2 text-sm text-muted-foreground">
        {t("player.lyrics.none")}
      </p>
    );
  }
  if (state.active.kind === "timed") {
    return (
      <TimedLyrics
        lines={state.active.lines}
        agents={state.active.agents}
        large={large}
      />
    );
  }
  return <PlainLyrics text={state.active.text} large={large} />;
}

/** How far from the top of the viewport the active line should sit,
 *  as a fraction of the visible height. 0.5 = perfectly centered;
 *  smaller pushes the active line up and reveals more upcoming text. */
const ACTIVE_LINE_VIEWPORT_RATIO = 0.36;

/** Duration of the auto-scroll that re-centers the active line.
 *  Native `scrollTo({ behavior: "smooth" })` is non-configurable in
 *  Chromium (~300 ms regardless of distance), which feels jumpy on
 *  long jumps — we drive the scroll ourselves with rAF instead. */
const SCROLL_DURATION_MS = 720;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Sampler for a CSS-style `cubic-bezier(x1, y1, x2, y2)`, so a scroll we
 *  drive from rAF can share a curve with the CSS transitions running
 *  beside it. Bisection on the x axis: 20 steps resolve the parameter far
 *  finer than a pixel of scroll, and the whole thing runs a few hundred
 *  times per seek, which is nothing. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const axis = (a: number, b: number, s: number) =>
    3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let s = t;
    for (let i = 0; i < 20; i++) {
      s = (lo + hi) / 2;
      if (axis(x1, x2, s) < t) lo = s;
      else hi = s;
    }
    return axis(y1, y2, s);
  };
}

/** Seek curve: hard start, long decelerating tail (the one iOS uses for
 *  sheet transitions). Keep in sync with the `[data-lyrics-seek]` rule in
 *  index.css so the scroll and the line highlight decelerate together. */
const easeOutSeek = cubicBezier(0.32, 0.72, 0, 1);

/** A position change bigger than this is a seek, not playback. The audio
 *  engine pushes the playhead a few times a second, so anything past a
 *  second means it was moved: the progress slider, a click on a line,
 *  media keys, the floating player. */
const SEEK_JUMP_S = 1.2;

/** Auto-scroll duration for a seek. Short enough that dragging the slider
 *  feels like the text is attached to the thumb, long enough to read as
 *  motion rather than a cut. Each new drag step interrupts the previous
 *  animation from wherever it got to, the same way a re-triggered CSS
 *  transition would. */
const SEEK_SCROLL_DURATION_MS = 350;

function TimedLyrics({
  lines,
  agents,
  large = false,
}: {
  lines: TimedLine[];
  agents?: Record<string, string>;
  large?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const seekHoldRef = useRef<number | null>(null);
  const playbackPosition = usePlaybackStore((s) => s.position);
  const seek = usePlaybackStore((s) => s.seek);
  // While the slider is being dragged the store's position still follows
  // the audio element, since the seek lands on release. Preview the drag
  // target so the text tracks the thumb the whole way.
  const scrub = useScrubStore((s) => s.scrub);
  const position = scrub ?? playbackPosition;
  const family = useLookFamily();
  const wordByWord = useLyricsSettings((s) => s.wordByWord);
  const firstAgent = useMemo(() => firstAgentOf(lines), [lines]);

  const activeIdx = findActiveIdx(lines, position, wordByWord);
  const prevActiveRef = useRef(activeIdx);
  const prevPositionRef = useRef(position);

  // On mount and whenever the lyric set changes (new track), snap the
  // active line into view without animation. Without this the animated
  // effect below never fires on mount (prevActiveRef starts equal to the
  // initial activeIdx), so opening the panel mid-song — or skipping tracks
  // while it stays mounted — leaves the active line off-screen / stale.
  // A look change re-snaps too: its face changes every line's height.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = findActiveIdx(
      lines,
      useScrubStore.getState().scrub ?? usePlaybackStore.getState().position,
      useLyricsSettings.getState().wordByWord,
    );
    prevActiveRef.current = idx;
    if (idx < 0) {
      container.scrollTop = 0;
      return;
    }
    const el = container.querySelector<HTMLElement>(`[data-line-idx="${idx}"]`);
    if (!el) {
      container.scrollTop = 0;
      return;
    }
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const elTopWithinContent = eRect.top - cRect.top + container.scrollTop;
    const target =
      idx === 0
        ? 0
        : container.clientHeight * ACTIVE_LINE_VIEWPORT_RATIO -
          el.clientHeight / 2;
    container.scrollTop = Math.max(0, elTopWithinContent - target);
  }, [lines, family]);

  // A layout effect, not a passive one: on a seek the container has to be
  // repositioned and the line cross-fade suppressed *before* the browser
  // paints the frame that already carries the new active line.
  useLayoutEffect(() => {
    const previous = prevPositionRef.current;
    prevPositionRef.current = position;
    // Dragging the slider is a continuous seek, so every step of it
    // counts however small: the thumb can crawl a line at a time.
    const isSeek =
      scrub !== null || Math.abs(position - previous) > SEEK_JUMP_S;

    if (activeIdx === prevActiveRef.current) return;
    prevActiveRef.current = activeIdx;
    if (activeIdx < 0) return;
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-line-idx="${activeIdx}"]`,
    );
    if (!el) return;
    // Position the active line above center so more upcoming lines stay
    // visible. getBoundingClientRect avoids depending on offsetParent.
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const elTopWithinContent = eRect.top - cRect.top + container.scrollTop;
    // The very first line is treated as a special case: we pin it to
    // the top of the viewport instead of the usual ~36% position. For
    // any later line, the active-line-above-center rule applies.
    const target =
      activeIdx === 0
        ? 0
        : container.clientHeight * ACTIVE_LINE_VIEWPORT_RATIO -
          el.clientHeight / 2;
    const targetTop = Math.max(0, elTopWithinContent - target);

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (isSeek) {
      // `data-lyrics-seek` shortens the per-line color/scale transition to
      // match the scroll (see index.css). Set from a layout effect, so it
      // is in place before the browser styles the frame that already
      // carries the new active line — the slow 1.26s cross-fade never gets
      // a chance to start. Held for the length of the scroll rather than
      // cleared next frame: a running transition keeps its original
      // timing, but the next drag step must find the attribute still on.
      container.dataset.lyricsSeek = "true";
      if (seekHoldRef.current !== null) clearTimeout(seekHoldRef.current);
      seekHoldRef.current = window.setTimeout(() => {
        seekHoldRef.current = null;
        delete container.dataset.lyricsSeek;
      }, SEEK_SCROLL_DURATION_MS);
    }

    const startTop = container.scrollTop;
    const delta = targetTop - startTop;
    if (Math.abs(delta) < 1) return;

    // Seeking gets the short decelerating curve; playback keeps the long
    // symmetric glide.
    const duration = isSeek ? SEEK_SCROLL_DURATION_MS : SCROLL_DURATION_MS;
    const ease = isSeek ? easeOutSeek : easeInOutCubic;
    const startTs = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      container.scrollTop = startTop + delta * ease(t);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    // `position` is a dependency even though only `activeIdx` moves the
    // scroll: the seek check has to see every tick, otherwise a jump that
    // lands inside the current line would sit in the ref and snap the
    // *next*, perfectly ordinary line change.
  }, [activeIdx, position, scrub]);

  // Word fill. Writes `--p` straight onto the active line's word spans, so
  // the per-frame work never goes through React. Only the active line is
  // touched: past and upcoming lines get their look from CSS (`data-fill`
  // is on the active line alone). A layout effect so a newly active line
  // never paints one frame with the fill it had last time.
  useLayoutEffect(() => {
    const words = lines[activeIdx]?.words;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-line-idx="${activeIdx}"]`,
    );
    if (!wordByWord || !words?.length || !el) return;
    const spans = el.querySelectorAll<HTMLElement>(":scope > [data-w]");
    const painted: string[] = [];
    // The store's position moves a few times a second; between ticks it is
    // extrapolated while playing (see `extrapolate`).
    let base = usePlaybackStore.getState().position;
    let at = performance.now();
    let raf: number | null = null;
    const paint = () => {
      const { playing } = usePlaybackStore.getState();
      const scrub = useScrubStore.getState().scrub;
      const pos = scrub ?? extrapolate(base, at, performance.now(), playing);
      spans.forEach((span, j) => {
        const w = words[j];
        if (!w) return;
        const p = `${wordFill(w, pos) * 100}%`;
        if (painted[j] === p) return;
        painted[j] = p;
        span.style.setProperty("--p", p);
      });
      // Loop only while the music moves on its own; a scrub or a paused
      // seek repaints from the subscriptions below.
      raf = playing && scrub === null ? requestAnimationFrame(paint) : null;
    };
    const kick = () => {
      if (raf === null) paint();
    };
    const offPlayback = usePlaybackStore.subscribe((s, prev) => {
      // Play/pause restarts the clock too, or a resume would extrapolate
      // from the stale pre-pause tick and start up to a second ahead.
      if (s.position !== prev.position || s.playing !== prev.playing) {
        base = s.position;
        at = performance.now();
        kick();
      }
    });
    const offScrub = useScrubStore.subscribe(kick);
    paint();
    return () => {
      offPlayback();
      offScrub();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [lines, activeIdx, wordByWord]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (seekHoldRef.current !== null) clearTimeout(seekHoldRef.current);
    };
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        data-look-family={family}
        className={cn(
          // The right inset is the room the active line's `scale-[1.06]`
          // needs. Text wraps against the layout box, but the scale is a
          // paint-time transform anchored at `origin-left`, so the active
          // line paints 6% wider than the box it wrapped inside and the
          // tail of the top row fell outside the column (`overflow-y-auto`
          // clips the x axis too). Reserving the overhang here rather than
          // on the active line alone keeps every line wrapping at the same
          // width, so nothing reflows at the moment a line lights up.
          // Percentage, not a fixed inset: the player card is resizable.
          "lyrics-no-scrollbar flex h-full select-text flex-col gap-1 overflow-y-auto pl-1 pr-[6%] pt-0 pb-16",
          // The top fade kicks in only after the karaoke has moved past
          // the first line — that way the first line stays crisp at the
          // top of the column while the song hasn't started or is on
          // line 0. The bottom fade is on throughout: the column runs
          // past the panel edge from the very first line, and without it
          // the last row is sliced through mid-glyph.
          activeIdx >= 1 ? "lyrics-mask" : "lyrics-mask-bottom",
        )}
      >
        {lines.map((line, i) => {
          const isActive = i === activeIdx;
          const isPast = i < activeIdx;
          const align = lineAlign(line.agent, agents, firstAgent);
          const singer = singerLabelAt(lines, i, agents);
          const words = wordByWord && line.words?.length ? line.words : null;
          return (
            <Fragment key={i}>
              {singer ? (
                <span
                  className={cn(
                    "mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em]",
                    large ? "px-3" : "px-2",
                    align === "right"
                      ? "self-end text-right text-muted-foreground"
                      : align === "center"
                        ? "self-center text-center text-brand"
                        : "text-brand",
                  )}
                >
                  {singer}
                </span>
              ) : null}
              <button
                type="button"
                data-line-idx={i}
                data-fill={isActive && words ? "" : undefined}
                onClick={() => seek(line.start)}
                className={cn(
                  // Same font-size on every line so the active line can't
                  // grow into a second row and shove neighbours around.
                  // The "active is bigger" feel comes from a transform
                  // scale (off the layout flow) plus weight + glow.
                  //
                  // Cross-fade duration is a touch longer than
                  // `ACTIVE_LOOKAHEAD_S` (800 ms) so the highlight is
                  // well past the midpoint by the time the new line
                  // actually starts, but still feels deliberate rather
                  // than abrupt. ease-in-out softens both ends.
                  // `scale` lives on its own CSS property in Tailwind v4
                  // (not `transform`), so it's listed explicitly in the
                  // transition. Both branches set a `scale-*` so the
                  // browser has a defined start AND end to interpolate.
                  "lyrics-line origin-left cursor-pointer rounded-md px-2 py-1 text-left font-[650] leading-snug transition-[scale,color] duration-[1260ms] ease-in-out hover:bg-black/10 dark:hover:bg-black/30",
                  large
                    ? "px-3 py-3.5 text-[31px] font-bold leading-[1.18] tracking-[-0.025em]"
                    : "text-lg",
                  // A lyric sheet: the look's headline face, with Instrument
                  // Serif at its one real weight.
                  "font-headline",
                  family === "liner" && "font-normal tracking-normal",
                  family === "ink" && "font-medium",
                  isActive
                    ? "scale-[1.06] text-foreground"
                    : family === "classic"
                      ? isPast
                        ? "scale-100 text-muted-foreground/40"
                        : "scale-100 text-muted-foreground/70"
                      : isPast
                        ? "scale-100 text-t9"
                        : "scale-100 text-t5",
                  align === "right" && "self-end origin-right text-right",
                  align === "center" && "self-center origin-center text-center",
                )}
              >
                {words
                  ? words.map((w, j) => (
                      <span key={j} data-w>
                        {w.text}
                      </span>
                    ))
                  : line.text || "♪"}
                {/* Under the line and inside the button, so a click on any
                  of them seeks. Opacity, not a colour, keeps them a step
                  below the line in every look and state. */}
                {line.roman ? (
                  <span className="mt-1 block font-sans text-[0.55em] font-medium leading-snug tracking-normal opacity-70">
                    {line.roman}
                  </span>
                ) : null}
                {line.translation ? (
                  <span className="mt-0.5 block text-[0.6em] font-normal italic leading-snug tracking-normal opacity-75">
                    {line.translation}
                  </span>
                ) : null}
                {line.bg?.text ? (
                  <span className="mt-0.5 block text-[0.7em] leading-snug opacity-70">
                    {line.bg.text}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}
      </div>
      {/* Static blur overlay — sits over the top of the lyrics column
          and applies `backdrop-filter` to whatever is visually behind
          it. Lines passing through the strip appear blurred, but the
          blur travels with the viewport, not the content — so when the
          user manually scrolls up to find an earlier line, that line
          becomes clear as it leaves the blurred strip.
          When the very first line is active it sits at viewport top
          (no above-center offset), so we fade the overlay out to keep
          the first line crisp. */}
      <div
        aria-hidden
        className="lyrics-blur-overlay pointer-events-none absolute inset-x-0 top-0 h-[26%] transition-opacity duration-500 ease-in-out"
        style={{ opacity: activeIdx <= 0 ? 0 : 1 }}
      />
      {/* The bottom edge softens the same way as the top, so upcoming
          lines dissolve out of the column instead of stopping on a
          line. */}
      <div
        aria-hidden
        className="lyrics-blur-overlay-bottom pointer-events-none absolute inset-x-0 bottom-0 h-[26%]"
      />
    </div>
  );
}

function PlainLyrics({
  text,
  large = false,
}: {
  text: string;
  large?: boolean;
}) {
  const family = useLookFamily();
  return (
    <div
      className={cn(
        "lyrics-mask app-scroll h-full select-text overflow-y-auto whitespace-pre-wrap px-2 pt-0 pb-12 font-medium leading-relaxed text-foreground/90",
        large ? "text-[26px] leading-normal" : "text-lg",
        "font-headline",
        family === "liner" && "font-normal",
      )}
    >
      {text}
    </div>
  );
}

export function LyricsSourceButton({
  state,
  className,
}: {
  state: LyricsViewState;
  className?: string;
}) {
  const t = useT();
  const { videoId, pref, setPref, best, availability } = state;
  const order = useLyricsSettings((s) => s.order);
  const off = useLyricsSettings((s) => s.off);
  const chineseConsent = useLyricsSettings((s) => s.chineseConsent);
  const romanize = useLyricsSettings((s) => s.romanize);
  const setRomanize = useLyricsSettings((s) => s.setRomanize);
  const translate = useLyricsSettings((s) => s.translate);
  const setTranslate = useLyricsSettings((s) => s.setTranslate);
  const targetLang = useLyricsSettings((s) => s.targetLang);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  // A source switched off, or waiting on consent, isn't offered at all.
  const sources = enabledSources({ order, off, chineseConsent });
  const picked = pref !== "auto" && sources.includes(pref) ? pref : "auto";
  const langLabel =
    TARGET_LANGS.find((l) => l.code === targetLang)?.label ?? targetLang;
  // Same key and loader as the file source in sources.ts, so this shares its
  // cache; unlike that query it also runs while the source is switched off.
  const { data: storedFile } = useQuery({
    queryKey: ["lyrics", "file", videoId],
    queryFn: () => loadLyricsFile(videoId!),
    enabled: !!videoId,
    staleTime: Infinity,
  });
  const hasFile = !!storedFile;

  const refreshFile = () =>
    queryClient.invalidateQueries({ queryKey: ["lyrics", "file", videoId] });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires change
    if (!file || !videoId) return;
    try {
      const lyrics = await saveLyricsFile(videoId, {
        name: file.name,
        text: await file.text(),
      });
      if (!lyrics) throw new Error("unreadable");
      // A file the user just added should show, even if they had switched
      // the file source off in Settings.
      const settings = useLyricsSettings.getState();
      if (settings.off.includes("file")) settings.setOn("file", true);
      await refreshFile();
      setPref("file");
      toast(t("player.lyrics.fileAdded"));
    } catch {
      toast(t("player.lyrics.fileUnreadable"));
    }
  };

  const onRemoveFile = async () => {
    if (!videoId) return;
    try {
      await removeLyricsFile(videoId);
      if (pref === "file") setPref("auto");
      await refreshFile();
    } catch {
      toast.error(t("player.lyrics.fileRemoveFailed"));
    }
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".ttml,.lrc,.xml"
        className="hidden"
        onChange={onFile}
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("player.lyrics.source")}
                className={cn(playerIconButton, className)}
              >
                <IconMicrophoneFilled />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("player.lyrics.source")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t("player.lyrics.sourceForSong")}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setPref("auto")}>
            <span className="flex-1">
              {t("player.lyrics.auto")}
              {best ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({SOURCE_LABELS[best]})
                </span>
              ) : null}
            </span>
            {picked === "auto" ? (
              <IconCheck className="size-4" stroke={2.4} />
            ) : null}
          </DropdownMenuItem>
          {sources.map((s) => {
            const a = availability[s];
            const badge = availabilityBadge(a);
            const dot =
              a === "word" || a === "line"
                ? "bg-brand"
                : a === "plain"
                  ? "bg-muted-foreground/60"
                  : a === "loading"
                    ? "bg-muted-foreground/30 animate-pulse"
                    : a === "error"
                      ? "bg-destructive"
                      : "bg-transparent";
            return (
              <DropdownMenuItem
                key={s}
                onSelect={() => setPref(s)}
                // Only a source that answered and had nothing is unselectable.
                // A failed one stays pickable: selecting it refetches it
                // (see `setPref` in `useLyricsView`).
                disabled={a === "none"}
              >
                <span
                  className={cn("mr-2 size-1.5 shrink-0 rounded-full", dot)}
                />
                <span className="flex-1">{SOURCE_LABELS[s]}</span>
                {badge ? (
                  <span className="font-mono text-[10px] tracking-[0.13em] text-muted-foreground">
                    {badge}
                  </span>
                ) : null}
                {picked === s ? (
                  <IconCheck className="size-4" stroke={2.4} />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={romanize}
            onCheckedChange={setRomanize}
          >
            {t("player.lyrics.romanization")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={translate}
            onCheckedChange={setTranslate}
          >
            {t("player.lyrics.translateTo", { language: langLabel })}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!videoId}
            onSelect={() => fileInput.current?.click()}
          >
            <span className="flex-1">{t("player.lyrics.useFile")}</span>
            <span className="font-mono text-[10px] tracking-[0.13em] text-muted-foreground">
              .TTML .LRC
            </span>
          </DropdownMenuItem>
          {hasFile ? (
            <DropdownMenuItem onSelect={() => void onRemoveFile()}>
              {t("player.lyrics.removeFile")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
