import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { coverBlobUrl } from "@/lib/rewind/palette";
import { quarterRange } from "@/lib/rewind/quarter";
import type { Palette, Ranked, Rewind } from "@/lib/rewind/types";

export type SlideSpec =
  | { kind: "intro" }
  | { kind: "minutes" }
  | { kind: "topArtist"; item: Ranked }
  | { kind: "artists"; items: Ranked[] }
  | { kind: "topSong"; item: Ranked }
  | { kind: "songs"; items: Ranked[] }
  | { kind: "topAlbum"; item: Ranked }
  | { kind: "hours" }
  | { kind: "newArtists"; items: Ranked[] }
  | { kind: "summary" };

/** The spec's slide order, minus slides with nothing to show. */
export function slidesFor(r: Rewind): SlideSpec[] {
  const s: (SlideSpec | false)[] = [
    { kind: "intro" },
    { kind: "minutes" },
    !!r.topArtists[0] && { kind: "topArtist", item: r.topArtists[0] },
    r.topArtists.length > 1 && { kind: "artists", items: r.topArtists },
    !!r.topSongs[0] && { kind: "topSong", item: r.topSongs[0] },
    r.topSongs.length > 1 && { kind: "songs", items: r.topSongs },
    !!r.topAlbums[0] && { kind: "topAlbum", item: r.topAlbums[0] },
    r.hours.some((h) => h > 0) && { kind: "hours" },
    r.newArtists.length > 0 && { kind: "newArtists", items: r.newArtists },
    { kind: "summary" },
  ];
  return s.filter((x): x is SlideSpec => !!x);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function quarterLabel(r: Rewind): string {
  const d = new Date(quarterRange(r.quarter).start);
  return `${MONTHS[d.getMonth()]}–${MONTHS[d.getMonth() + 2]} ${d.getFullYear()}`;
}

/** The cover a slide shows (and takes its colours from). */
function coverOf(s: SlideSpec): string | undefined {
  switch (s.kind) {
    case "topArtist":
      return s.item.topAlbum?.thumb ?? s.item.thumb;
    case "topSong":
    case "topAlbum":
      return s.item.thumb;
    case "newArtists":
      return s.items[0]?.thumb;
    default:
      return undefined;
  }
}

const NEUTRAL: Palette = { bg: ["#3a2a4a", "#1c1424", "#0a0a0a"], accent: "#ff5c8a" };

export function paletteOf(s: SlideSpec, r: Rewind): Palette {
  const own = coverOf(s);
  const top = r.topAlbums[0]?.thumb ?? r.topArtists[0]?.topAlbum?.thumb;
  return (own && r.palette?.[own]) || (top && r.palette?.[top]) || NEUTRAL;
}

function useBlob(url: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (url) void coverBlobUrl(url).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [url]);
  return src;
}

const fmt = (n: number) => n.toLocaleString();

function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--rw-accent)]">{children}</div>;
}
function Big({ children }: { children: ReactNode }) {
  return <div className="mt-2 text-balance text-[clamp(2.5rem,7vw,4.5rem)] font-black leading-[0.95] tracking-tight">{children}</div>;
}
function Num({ children }: { children: ReactNode }) {
  return <div className="mt-3 text-[clamp(4rem,12vw,7.5rem)] font-black leading-[0.9] text-[var(--rw-accent)]">{children}</div>;
}
function Small({ children }: { children: ReactNode }) {
  return <div className="mt-2 text-sm text-white/80">{children}</div>;
}
function List({ items, unit = "plays" }: { items: Ranked[]; unit?: string }) {
  return (
    <ol className="mt-5 flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-baseline gap-3">
          <span className="w-6 text-right text-xl font-black text-[var(--rw-accent)]">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-2xl font-bold">{it.name}</span>
          <span className="text-xs text-white/60">
            {fmt(it.plays)} {unit}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Body({ s, r }: { s: SlideSpec; r: Rewind }) {
  switch (s.kind) {
    case "intro":
      return (
        <>
          <Label>Your Rewind</Label>
          <Big>{quarterLabel(r)}</Big>
          <Small>Your last three months in music. Tap to start.</Small>
        </>
      );
    case "minutes":
      return (
        <>
          <Label>You listened for</Label>
          <Num>{fmt(r.minutes)}</Num>
          <Small>minutes, across {fmt(r.plays)} plays</Small>
        </>
      );
    case "topArtist":
      return (
        <>
          <Label>Your top artist</Label>
          <Big>{s.item.name}</Big>
          <Num>{fmt(s.item.minutes)}</Num>
          <Small>minutes this quarter</Small>
          {s.item.topAlbum ? <div className="mt-4 text-xs text-white/60">Most played: {s.item.topAlbum.name}</div> : null}
        </>
      );
    case "artists":
      return (
        <>
          <Label>Your top artists</Label>
          <List items={s.items} />
        </>
      );
    case "topSong":
      return (
        <>
          <Label>Your top song</Label>
          <Big>{s.item.name}</Big>
          <Num>{fmt(s.item.plays)}</Num>
          <Small>plays this quarter</Small>
        </>
      );
    case "songs":
      return (
        <>
          <Label>Your top songs</Label>
          <List items={s.items} />
        </>
      );
    case "topAlbum":
      return (
        <>
          <Label>Your top album</Label>
          <Big>{s.item.name}</Big>
          <Num>{fmt(s.item.minutes)}</Num>
          <Small>minutes this quarter</Small>
        </>
      );
    case "hours": {
      const max = Math.max(...r.hours, 1);
      const peak = r.hours.indexOf(max);
      const h = peak % 12 || 12;
      return (
        <>
          <Label>When you listen</Label>
          <Big>
            Most around {h} {peak < 12 ? "am" : "pm"}
          </Big>
          <div className="mt-6 flex h-32 items-end gap-[3px]">
            {r.hours.map((m, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{ height: `${Math.max(4, (m / max) * 100)}%`, background: i === peak ? "var(--rw-accent)" : "rgb(255 255 255 / 0.25)" }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/50">
            <span>12 am</span>
            <span>6 am</span>
            <span>12 pm</span>
            <span>6 pm</span>
            <span>11 pm</span>
          </div>
        </>
      );
    }
    case "newArtists":
      return (
        <>
          <Label>New to you</Label>
          <Big>You found {s.items.length} new {s.items.length === 1 ? "artist" : "artists"}</Big>
          <List items={s.items} />
        </>
      );
    case "summary":
      return (
        <>
          <Label>Rewind · {quarterLabel(r)}</Label>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">Top artists</div>
              <ol className="mt-2 space-y-1 text-lg font-bold">
                {r.topArtists.map((a, i) => (
                  <li key={a.key} className="truncate">
                    {i + 1}. {a.name}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">Top songs</div>
              <ol className="mt-2 space-y-1 text-lg font-bold">
                {r.topSongs.map((a, i) => (
                  <li key={a.key} className="truncate">
                    {i + 1}. {a.name}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="mt-6 text-xs uppercase tracking-widest text-white/60">Minutes listened</div>
          <div className="text-5xl font-black text-[var(--rw-accent)]">{fmt(r.minutes)}</div>
          <div className="mt-4 text-[11px] text-white/50">YTubic Plus</div>
        </>
      );
  }
}

/** One full-bleed slide: palette gradient, tilted cover, big type at the bottom. */
export function Slide({ s, r, current }: { s: SlideSpec; r: Rewind; current: boolean }) {
  const p = paletteOf(s, r);
  const cover = useBlob(coverOf(s));
  const style = {
    "--rw-accent": p.accent,
    background: `radial-gradient(130% 90% at 80% 10%, ${p.bg[0]} 0%, ${p.bg[1]} 45%, ${p.bg[2]} 100%)`,
  } as CSSProperties;
  return (
    <div
      data-slide={s.kind}
      {...(current && { "data-slide-current": s.kind })}
      aria-hidden={!current}
      className="absolute inset-0 overflow-hidden text-white"
      style={{ ...style, visibility: current ? "visible" : "hidden" }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute right-[-12%] top-[8%] aspect-square w-[62%] max-w-[560px] rotate-[8deg] rounded-lg object-cover shadow-[0_16px_50px_rgb(0_0_0/0.55)]"
        />
      ) : null}
      {/* Light grain, as in the mockup. */}
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:repeating-radial-gradient(circle_at_30%_30%,rgb(255_255_255/0.035)_0_1px,transparent_1px_3px)]" />
      <div className="absolute inset-x-0 bottom-0 px-[8%] pb-[10%]">
        <div className="max-w-[640px]">
          <Body s={s} r={r} />
        </div>
      </div>
    </div>
  );
}
