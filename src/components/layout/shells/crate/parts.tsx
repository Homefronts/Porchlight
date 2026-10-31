import { forwardRef, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { COVER_RADIUS } from "@/components/layout/player-chrome";
import { Button } from "@/components/ui/button";
import { Thumbnail } from "@/components/shared/thumbnail";
import { ArtworkOutline } from "@/components/shared/artwork-outline";
import { ArtistLinks } from "@/components/shared/artist-links";
import { LikeDislikeButtons } from "@/components/shared/like-buttons";
import { useAlbumMenuController } from "@/components/shared/album-menu";
import { formatTime, useITunesCover } from "@/components/layout/player-bar";
import { recordTitleClass, useLookFamily } from "@/components/theme/look-type";
import { sideLetter } from "@/components/theme/section-label";
import { Vinyl } from "@/components/theme/vinyl";
import { useAiFilter } from "@/lib/ai/use-ai";
import { playPlaylistNow } from "@/lib/play-playlist";
import { openFullscreen } from "@/lib/store/fullscreen";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import type { Shelf, ShelfItem } from "@/lib/innertube/types";
import { cn } from "@/lib/utils";
import { useLyricsView } from "@/components/layout/lyrics-view";
import { LyricsButton, Transport } from "../gatefold/parts";
import { useCompact } from "../compact";
import { usePlayerStyle } from "../player-colour";
import { crateStep } from "./step";
import { LinerNotes } from "./liner-notes";
const MONO = "font-meta text-[11px] uppercase tracking-[0.1em]";
const CHIP = "h-8 rounded-none px-3 font-meta text-[11px] uppercase tracking-[0.1em]";

/**
 * Where each record sits, by its distance from the front: 0 is the front,
 * 1.. lean back to its left (the ones still to flip to), -1 has just been
 * flipped past and fades out to the right. The mockup's lean, per size.
 */
const FULL = {
  size: 250,
  frontX: 330,
  sleeves: [
    { x: 140, rx: 9, ry: 26, s: 0.94 },
    { x: 70, rx: 12, ry: 32, s: 0.88 },
    { x: 0, rx: 14, ry: 38, s: 0.82 },
  ],
};
const COMPACT = {
  size: 200,
  frontX: 170,
  sleeves: [
    { x: 60, rx: 9, ry: 26, s: 0.92 },
    { x: 0, rx: 12, ry: 32, s: 0.86 },
  ],
};

function placement(slot: number, g: typeof FULL): React.CSSProperties {
  if (slot === 0) return { transform: `translateX(${g.frontX}px)`, zIndex: 10 };
  if (slot < 0)
    return {
      transform: `translateX(${g.frontX + g.size * 0.5}px) rotateY(-24deg) scale(0.9)`,
      opacity: 0,
      pointerEvents: "none",
    };
  const p = g.sleeves[slot - 1];
  // Sleeves are a size down (200 to the front's 250) and stand 30px lower.
  return {
    transform: `translateX(${p.x}px) translateY(-${g.size * 0.12}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) scale(${p.s * 0.8})`,
    zIndex: 10 - slot,
  };
}

function subtitleOf(it: ShelfItem): string {
  return it.subtitle ?? it.artists?.map((a) => a.name).join(", ") ?? it.album ?? "";
}

/** A long-form video filed as a playlist plays as the song it is (as on ShelfCard). */
function playable(it: ShelfItem): ShelfItem | null {
  if (it.kind === "song" || it.kind === "video") return it;
  if (it.kind === "playlist" && it.playableVideoId) return { ...it, kind: "song", id: it.playableVideoId };
  return null;
}

function Cover({ item, className }: { item: ShelfItem; className?: string }) {
  if (item.kind === "category") {
    // Mood tiles have no art: a plain sleeve in their tint with the name on it.
    return (
      <div
        className={cn("grid size-full place-items-center p-4 text-center text-xl font-semibold text-white", COVER_RADIUS, className)}
        style={{ background: item.tint ?? "#666" }}
      >
        {item.title}
      </div>
    );
  }
  return (
    <>
      <Thumbnail thumbnails={item.thumbnails} alt="" className={cn("size-full", COVER_RADIUS, className)} targetSize={512} highRes />
      <ArtworkOutline className={COVER_RADIUS} />
    </>
  );
}

/** The front record's page, for the kinds that have one. */
function OpenLink({ item, className, children }: { item: ShelfItem; className?: string; children: React.ReactNode }) {
  const p = { className, children };
  switch (item.kind) {
    case "album":
      return <Link to="/album/$id" params={{ id: item.id }} {...p} />;
    case "playlist":
      return <Link to="/playlist/$id" params={{ id: item.id }} {...p} />;
    case "artist":
      return <Link to="/artist/$id" params={{ id: item.id }} {...p} />;
    case "category":
      return <Link to="/moods/$id" params={{ id: item.id }} search={{ p: item.categoryParams ?? "", t: item.title }} {...p} />;
    default:
      return null;
  }
}

/** Play for every kind that plays; artists and moods open instead. */
function useActions(item: ShelfItem | undefined) {
  const album = useAlbumMenuController(item?.id ?? "");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const play = () => {
    if (!item) return;
    const song = playable(item);
    if (song) return usePlaybackStore.getState().playNow(song);
    if (item.kind === "album") return void album.play(false);
    if (item.kind === "playlist")
      return void playPlaylistNow(item.id, qc)
        .then((ok) => !ok && toast.error("This playlist is empty"))
        .catch((e) => toast.error(`Couldn't load playlist: ${String(e)}`));
    if (item.kind === "artist") return void navigate({ to: "/artist/$id", params: { id: item.id } });
    if (item.kind === "category")
      return void navigate({ to: "/moods/$id", params: { id: item.id }, search: { p: item.categoryParams ?? "", t: item.title } });
  };
  const song = item && playable(item);
  const queue = song
    ? () => {
        usePlaybackStore.getState().enqueueEnd(song);
        toast.success(`Added to queue: ${song.title}`);
      }
    : item?.kind === "album"
      ? () => void album.addToQueue()
      : null;
  return { play, queue, canPlay: !!song || item?.kind === "album" || item?.kind === "playlist" };
}

/**
 * Crate's Home: the current shelf as a crate of records. Dividers pick the
 * shelf; left and right (or a click on a leaning sleeve) flip the front
 * record; Enter plays it. Only the front and the few sleeves around it are
 * drawn, however long the shelf.
 */
export function Crate({ shelves: all }: { shelves: Shelf[] }) {
  const filter = useAiFilter();
  const shelves = all.map((s) => ({ ...s, items: filter(s.items) })).filter((s) => s.items.length > 0);
  // Remembered by title (Home's shelf identity), so a refresh or reorder keeps it.
  const [shelfTitle, setShelfTitle] = useState<string>();
  const [frontAt, setFrontAt] = useState(0);
  const crateRef = useRef<HTMLDivElement>(null);
  const g = useCompact() ? COMPACT : FULL;
  const family = useLookFamily();

  const si = Math.max(
    shelves.findIndex((s) => s.title === shelfTitle),
    0,
  );
  const shelf = shelves[si];
  const items = shelf?.items ?? [];
  const front = crateStep(frontAt, 0, items.length);
  const item = items[front];
  const act = useActions(item);
  if (!shelf || !item) return null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.isContentEditable || t.closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      // From the latest index, so presses faster than a render all count.
      const dir = e.key === "ArrowRight" ? 1 : -1;
      setFrontAt((f) => crateStep(crateStep(f, 0, items.length), dir, items.length));
    } else if (e.key === "Enter" && t === e.currentTarget) {
      // Only on the crate itself: Enter on one of its buttons is that button's.
      e.preventDefault();
      act.play();
    }
  };

  const title = (
    <span className={cn("line-clamp-2 font-semibold leading-[0.95]", g === FULL ? "text-[30px]" : "text-2xl", recordTitleClass(family))}>
      {item.title}
    </span>
  );
  // Sleeves and the step buttons can unmount or disable under focus; the
  // crate keeps it so the arrows go on working.
  const holdFocus = () => crateRef.current?.focus({ preventScroll: true });
  const stepTo = (i: number) => {
    setFrontAt(i);
    if (i === 0 || i === items.length - 1) holdFocus();
  };
  const first = Math.max(front - 1, 0);
  const shown = items.slice(first, front + g.sleeves.length + 1);

  return (
    <section aria-label="Crate" data-crate-home className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Shelves"
        // Compact keeps the dividers to one scrolling row so the crate stays in view.
        className={cn("flex gap-2", g === FULL ? "flex-wrap" : "app-scroll -mb-2 overflow-x-auto pb-2 [&>*]:shrink-0")}
      >
        {shelves.map((s, i) => (
          <Button
            key={s.id}
            aria-pressed={i === si}
            variant="outline"
            onClick={() => {
              setShelfTitle(s.title);
              setFrontAt(0);
            }}
            className={cn(CHIP, i === si ? "on-brand border-brand bg-brand text-white hover:bg-brand/90 hover:text-white" : "text-muted-foreground")}
          >
            {s.title}
          </Button>
        ))}
      </div>
      <div
        ref={crateRef}
        tabIndex={0}
        role="group"
        aria-roledescription="crate"
        aria-label={`${shelf.title}: ${item.title}, ${front + 1} of ${items.length}. Arrow keys flip, Enter plays.`}
        onKeyDown={onKey}
        className="relative outline-none [perspective:1400px] focus-visible:ring-2 focus-visible:ring-ring"
        // Seen from the front record, so the sleeves recede behind it.
        style={{ height: g.size, perspectiveOrigin: `${g.frontX}px 50%` }}
      >
        {shown.map((it, i) => {
          const slot = first + i - front;
          return (
            <button
              key={`${it.kind}:${it.id}:${first + i}`}
              type="button"
              tabIndex={-1}
              aria-hidden={slot !== 0 || undefined}
              aria-label={slot === 0 ? undefined : `Bring ${it.title} to the front`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                holdFocus();
                if (slot === 0) act.play();
                else setFrontAt(first + i);
              }}
              className={cn(
                "absolute start-0 top-0 isolate origin-bottom motion-safe:transition-[transform,opacity] motion-safe:duration-300",
                slot === 0 ? "shadow-[0_20px_40px_rgb(0_0_0/0.6)]" : "shadow-[-8px_0_20px_rgb(0_0_0/0.55)]",
                COVER_RADIUS,
              )}
              style={{ width: g.size, height: g.size, ...placement(slot, g) }}
            >
              <Cover item={it} />
            </button>
          );
        })}
        <div
          className="absolute end-0 top-0 flex flex-col justify-end"
          style={{ left: g.frontX + g.size + 26, height: g.size }}
        >
          <span className={cn(MONO, "text-acc1")}>
            {sideLetter(si)}
            {front + 1} · {item.kind}
          </span>
          {playable(item) ? title : (
            <OpenLink item={item} className="hover:underline">
              {title}
            </OpenLink>
          )}
          <span className="truncate font-headline text-xl italic text-muted-foreground">{subtitleOf(item)}</span>
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              onClick={act.play}
              className={cn(CHIP, "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
            >
              {act.canPlay ? "▸ Play" : "Open ▸"}
            </Button>
            {act.queue && (
              <Button variant="outline" onClick={act.queue} className={CHIP}>
                + Queue
              </Button>
            )}
            {playable(item) && <LikeDislikeButtons videoId={playable(item)!.id} track={item} />}
          </div>
          <div className={cn(MONO, "mt-3 flex items-center gap-3 text-muted-foreground")}>
            <Button variant="ghost" size="sm" className={CHIP} aria-label="Previous record" disabled={front === 0} onClick={() => stepTo(front - 1)}>
              ‹
            </Button>
            <span className="tabular-nums">
              {front + 1} / {items.length}
            </span>
            <Button variant="ghost" size="sm" className={CHIP} aria-label="Next record" disabled={front === items.length - 1} onClick={() => stepTo(front + 1)}>
              ›
            </Button>
            <Link to="/shelf/$title" params={{ title: shelf.title }} className="hover:text-foreground hover:underline">
              See all ▸
            </Link>
          </div>
        </div>
      </div>
      <LinerNotes item={item} song={playable(item)} />
    </section>
  );
}

/**
 * The bottom deck: the playing record turning on the platter, its label cut
 * from the cover, then the title, the transport and Up Next. Empty, a blank
 * platter with the arm parked. Compact drops Up Next (the Queue button stays).
 */
export const Turntable = forwardRef<HTMLDivElement, { compact: boolean }>(function Turntable({ compact }, ref) {
  const track = usePlaybackStore(currentTrack);
  const { playing, queue, index } = usePlaybackStore(
    useShallow((s) => ({ playing: s.playing, queue: s.queue, index: s.index })),
  );
  const upNext = queue.slice(index + 1, index + 3);
  const iTunesCover = useITunesCover(track);
  const family = useLookFamily();
  const lyrics = useLyricsView(track);
  const deck = compact ? 120 : 150;
  const playerStyle = usePlayerStyle();
  return (
    <footer
      ref={ref}
      aria-label="Turntable"
      style={playerStyle}
      // No player colour: --player is unset, so no ground, as before.
      className={cn("relative flex shrink-0 items-center border-t border-w110 bg-(--player)", compact ? "gap-4 px-5" : "gap-[22px] px-7")}
    >
      <button
        type="button"
        aria-label={track ? "Open full screen" : "Empty platter"}
        disabled={!track}
        onClick={openFullscreen}
        // Clip only the record's bottom edge here, not the whole footer, so popups like volume can grow upward.
        className="relative shrink-0 self-stretch overflow-y-clip"
        style={{ width: deck, minHeight: compact ? 96 : 112 }}
      >
        <Vinyl
          always
          className={cn(
            "inset-auto start-0 top-2.5 z-0 translate-none", compact ? "size-[120px]" : "size-[150px]",
            track && "motion-safe:animate-[spin_6s_linear_infinite]",
            !playing && "[animation-play-state:paused]",
          )}
        >
          <div className={cn("absolute inset-[31%] overflow-hidden rounded-full", !track && "grid place-items-center bg-[#1d1b19]")}>
            {track ? (
              <Thumbnail thumbnails={track.thumbnails} alt="" className="size-full" targetSize={256} highRes overrideHighRes={iTunesCover} />
            ) : (
              <i className="size-2 rounded-full bg-background" />
            )}
          </div>
        </Vinyl>
        {/* Tone arm: on the record while there is one, parked when empty. */}
        <span
          aria-hidden
          className="absolute top-1.5 h-[70px] w-1 origin-top rounded-sm bg-[#8a8378] motion-safe:transition-transform"
          style={{ right: track ? -6 : 0, transform: `rotate(${track ? 28 : -8}deg)` }}
        />
      </button>
      <div className={cn("flex min-w-0 flex-col", compact ? "w-[150px]" : "w-[220px]")}>
        {track ? (
          <>
            <span className={cn("truncate font-semibold leading-none", compact ? "text-lg" : "text-[22px]", recordTitleClass(family))}>
              {track.title}
            </span>
            <ArtistLinks artists={track.artists} fallback={track.subtitle ?? ""} className="truncate font-headline text-lg italic text-muted-foreground" />
          </>
        ) : (
          <>
            <span className={cn("font-semibold leading-none text-muted-foreground", compact ? "text-lg" : "text-[22px]", recordTitleClass(family))}>
              Nothing playing
            </span>
            <span className="font-headline text-lg italic text-muted-foreground">Drop a record on the platter</span>
          </>
        )}
      </div>
      <Transport compact={false} className="mt-0 min-w-0 flex-1 gap-1.5 py-2" />
      <LyricsButton state={lyrics} side="top" />
      {!compact && (
        <div className={cn("w-[200px] shrink-0 font-meta text-[11px] text-muted-foreground", !track && "opacity-50")}>
          <div className={cn(MONO, "text-muted-foreground/70")}>Up next</div>
          {upNext.length === 0 ? (
            <div>Queue is empty</div>
          ) : (
            upNext.map((t, i) => (
              <div key={`${t.videoId}:${i}`} className="flex justify-between gap-2 py-px">
                <span className="truncate">{t.title}</span>
                {t.duration ? <span className="shrink-0 tabular-nums">{formatTime(t.duration)}</span> : null}
              </div>
            ))
          )}
        </div>
      )}
    </footer>
  );
});
