import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { withCover } from "@/components/shared/album-menu";
import { formatTime } from "@/components/layout/player-bar";
import { ArtistLinks } from "@/components/shared/artist-links";
import { fetchAlbum } from "@/lib/innertube/album";
import { fetchPlaylistFirstPage } from "@/lib/innertube/playlist";
import type { AlbumPage, ShelfItem } from "@/lib/innertube/types";
import { playPlaylistNow } from "@/lib/play-playlist";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { cn } from "@/lib/utils";

const MONO = "font-meta text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

/** The first `perSide * 2` tracks as two sides, A1.. and B1.., each row with its index in `tracks`. */
export function linerSides<T>(tracks: T[], perSide: number) {
  const side = (letter: string, from: number) =>
    tracks.slice(from, from + perSide).map((track, i) => ({ track, no: `${letter}${i + 1}`, at: from + i }));
  return { a: side("A", 0), b: side("B", perSide) };
}

/** The panel's header, the gap and the footer line around its rows. */
const LINER_CHROME = 72;
/** A row's height (`h-[39px]` below). */
const LINER_ROW = 39;

/** Rows per side that fit in `free` px, 3 to 6; 0 hides the notes, so Home never scrolls for them. */
export function linerRows(free: number): number {
  const rows = Math.min(Math.floor((free - LINER_CHROME) / LINER_ROW), 6);
  return rows >= 3 ? rows : 0;
}

/** Whether a click inside a row belongs to a link or button there rather than to the row. */
export function ownClick(target: EventTarget): boolean {
  return !!(target as Element).closest?.("a,button");
}

/**
 * The height left under `el` in its page scroller: the scroller's height,
 * less everything above `el` and everything the page puts below it. One
 * ResizeObserver on the scroller (window, compact tabs row) and its content
 * (wrapped shelf chips, the feed's loader); `el`'s own height never counts,
 * so the panel growing into the space doesn't change it.
 */
function useFreeBelow(ref: React.RefObject<HTMLElement | null>): number {
  const [free, setFree] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    const content = main?.firstElementChild;
    if (!el || !main || !content) return;
    const ro = new ResizeObserver(() => {
      const m = main.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const below = content.getBoundingClientRect().bottom - r.bottom;
      setFree(Math.floor(main.clientHeight - (r.top - m.top + main.scrollTop) - below));
    });
    ro.observe(main);
    ro.observe(content);
    return () => ro.disconnect();
  }, [ref]);
  return free;
}

const plural = (n: number) => `${n} track${n === 1 ? "" : "s"}`;

/**
 * Crate's liner notes: under the front record, its first tracks as Side A
 * and Side B (a click plays the record from there), or a single's credits.
 * Artists and moods have none. Fetched only once the front record has sat
 * still for 250ms, so flipping through the crate doesn't fetch each one.
 */
export function LinerNotes({ item, song }: { item: ShelfItem; song: ShelfItem | null }) {
  // Always there, empty or not, so it can be measured.
  const ref = useRef<HTMLDivElement>(null);
  const perSide = linerRows(useFreeBelow(ref));
  return (
    <div ref={ref}>
      {perSide > 0 && <Notes item={item} song={song} perSide={perSide} />}
    </div>
  );
}

function Notes({ item, song, perSide }: { item: ShelfItem; song: ShelfItem | null; perSide: number }) {
  const key = `${item.kind}:${item.id}`;
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), 250);
    return () => clearTimeout(t);
  }, [key]);
  const kind = song ? null : item.kind === "album" || item.kind === "playlist" ? item.kind : null;
  // The same cache entries as playPlaylistNow and the album menu, so a click plays from it.
  const q = useQuery({
    queryKey: kind === "album" ? ["album", item.id] : ["playlist-first", item.id],
    queryFn: () => (kind === "album" ? fetchAlbum(item.id) : fetchPlaylistFirstPage(item.id)),
    staleTime: 5 * 60_000,
    enabled: !!kind && settled === key,
  });
  const qc = useQueryClient();
  const playingId = usePlaybackStore((s) => currentTrack(s)?.videoId);

  if (!song && !kind) return null;

  const play = (at: number) => {
    if (kind === "album") {
      const s = usePlaybackStore.getState();
      s.playShelfItems(withCover(q.data as AlbumPage), at);
      s.setShuffle(false);
    } else
      void playPlaylistNow(item.id, qc, at)
        .then((ok) => !ok && toast.error("This playlist is empty"))
        .catch((e) => toast.error(`Couldn't load playlist: ${String(e)}`));
  };
  return (
    <TrackNotes
      title={item.title}
      song={song}
      tracks={q.data?.tracks}
      count={q.data && (q.data.trackCount ?? ("continuationToken" in q.data && q.data.continuationToken ? undefined : q.data.tracks.length))}
      failed={q.isError}
      perSide={perSide}
      playingId={playingId}
      onPlay={play}
      open={
        kind === "album" ? (
          <Link to="/album/$id" params={{ id: item.id }} className="text-foreground hover:underline">
            Open the full record ›
          </Link>
        ) : (
          <Link to="/playlist/$id" params={{ id: item.id }} className="text-foreground hover:underline">
            Open the full record ›
          </Link>
        )
      }
    />
  );
}

/** The panel itself, from whatever has loaded. */
export function TrackNotes({
  title,
  song,
  tracks,
  count,
  failed,
  perSide,
  playingId,
  onPlay,
  open,
}: {
  title: string;
  song: ShelfItem | null;
  tracks?: ShelfItem[];
  count?: number;
  failed: boolean;
  perSide: number;
  playingId?: string;
  onPlay: (at: number) => void;
  open: React.ReactNode;
}) {
  const header = (
    <div className={cn(MONO, "flex justify-between gap-4 border-b border-w110 pb-2.5")}>
      <span className="truncate">
        <b className="font-semibold text-brand">Liner notes</b> · {title}
      </span>
      {!song && count !== undefined && <span className="shrink-0">{plural(count)}</span>}
    </div>
  );

  if (song) {
    const artist = song.artists?.length || song.subtitle ? (
      <ArtistLinks artists={song.artists} fallback={song.subtitle} />
    ) : undefined;
    return (
      <section aria-label="Liner notes" className="max-w-[1100px]">
        {header}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[15px]">
          {(
            [
              ["Title", song.title],
              ["Artist", artist],
              ["From", song.album],
              ["Time", song.duration ? formatTime(song.duration) : undefined],
            ] as const
          ).map(([k, v]) =>
            v ? (
              <div key={k} className="contents">
                <dt className={MONO}>{k}</dt>
                <dd className="truncate">{v}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>
    );
  }

  const shown = Math.min(tracks?.length ?? 0, perSide * 2);
  const { a, b } = linerSides(tracks ?? [], perSide);
  const row = "grid h-[39px] grid-cols-[34px_1fr_auto] items-baseline gap-2 border-b border-w110/60 py-[9px]";
  const column = (rows: typeof a) => (
    <div>
      {rows.map(({ track: t, no, at }) => {
        const now = t.id === playingId;
        return (
          // The whole row plays; the title is the keyboard button, and artist links open the artist instead.
          <div
            key={no}
            data-liner-row
            aria-current={now || undefined}
            onClick={() => onPlay(at)}
            className={cn(row, "w-full cursor-pointer text-start hover:bg-w110/40")}
          >
            <span className={cn(MONO, "font-semibold tracking-normal")}>{no}</span>
            <span className={cn("truncate text-[15px]", now && "text-brand")}>
              <button
                type="button"
                aria-label={`Play ${t.title} from here`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(at);
                }}
                className="text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.title}
              </button>
              <span onClick={(e) => ownClick(e.target) && e.stopPropagation()}>
                <ArtistLinks
                  artists={t.artists}
                  fallback={t.subtitle}
                  className="ms-2 font-headline text-sm italic text-muted-foreground"
                />
              </span>
            </span>
            <span className="font-meta text-xs tabular-nums text-muted-foreground">{t.duration ? formatTime(t.duration) : ""}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <section aria-label="Liner notes" className="max-w-[1100px]">
      {header}
      {tracks ? (
        tracks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No tracks on this record</p>
        ) : (
          <>
            <div className="mt-1.5 grid grid-cols-2 gap-x-12">
              {column(a)}
              {column(b)}
            </div>
            <div className={cn(MONO, "mt-3.5 flex justify-between gap-4 font-semibold")}>
              <span>{count !== undefined && count <= shown ? plural(count) : `First ${shown}${count !== undefined ? ` of ${count}` : ""}`}</span>
              {open}
            </div>
          </>
        )
      ) : failed ? (
        <p className="mt-3 text-sm text-muted-foreground">Couldn't load the tracks</p>
      ) : (
        <div aria-hidden className="mt-1.5 grid grid-cols-2 gap-x-12">
          {[0, 1].map((c) => (
            <div key={c}>
              {Array.from({ length: perSide }, (_, i) => (
                <div key={i} className={row}>
                  <Skeleton className="h-3 w-5 rounded-sm" />
                  <Skeleton className="h-3.5 w-2/3 rounded-sm" />
                  <span />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
