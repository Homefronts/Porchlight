import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { coverBlobUrl } from "@/lib/rewind/palette";
import { quarterRange } from "@/lib/rewind/quarter";
import type { Ranked, Rewind } from "@/lib/rewind/types";
import { cn } from "@/lib/utils";

export type SlideSpec =
  | { kind: "intro" }
  | { kind: "setup" }
  | { kind: "minutes" }
  | { kind: "variety" }
  | { kind: "topArtist"; item: Ranked }
  | { kind: "artists"; items: Ranked[] }
  | { kind: "songs"; items: Ranked[] }
  | { kind: "topAlbum"; item: Ranked }
  | { kind: "personality" }
  | { kind: "genres"; items: string[] }
  | { kind: "newArtists"; items: Ranked[] }
  | { kind: "summary" };

/** The slide order, minus slides with nothing to show. */
export function slidesFor(r: Rewind): SlideSpec[] {
  const s: (SlideSpec | false)[] = [
    { kind: "intro" },
    { kind: "setup" },
    { kind: "minutes" },
    r.songs > 0 && { kind: "variety" },
    !!r.topArtists[0] && { kind: "topArtist", item: r.topArtists[0] },
    r.topArtists.length > 1 && { kind: "artists", items: r.topArtists },
    !!r.topSongs[0] && { kind: "songs", items: r.topSongs },
    !!r.topAlbums[0] && { kind: "topAlbum", item: r.topAlbums[0] },
    r.hours.some((h) => h > 0) && { kind: "personality" },
    !!r.genres?.length && { kind: "genres", items: r.genres },
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

/** Flat, loud colour per slide; `dark` means dark text on it. `hi` highlights numbers.
 *  Contrast is pinned by a test: text 4.5:1, highlights 3:1. */
export const THEME: Record<SlideSpec["kind"], { bg: string; dark?: true; hi: string }> = {
  intro: { bg: "#ff4fa3", dark: true, hi: "#111111" },
  setup: { bg: "#c6f432", dark: true, hi: "#111111" },
  minutes: { bg: "#2b4bff", hi: "#c6f432" },
  variety: { bg: "#ff8a1f", dark: true, hi: "#3a0ca3" },
  topArtist: { bg: "#7a2cff", hi: "#ffd84d" },
  artists: { bg: "#111111", hi: "#c6f432" },
  songs: { bg: "#ffd84d", dark: true, hi: "#c1121f" },
  topAlbum: { bg: "#007a4d", hi: "#ffd84d" },
  personality: { bg: "#5ce1e6", dark: true, hi: "#111111" },
  genres: { bg: "#c4161c", hi: "#ffd84d" },
  newArtists: { bg: "#c6f432", dark: true, hi: "#7a2cff" },
  summary: { bg: "#2b4bff", hi: "#2b4bff" },
};

/** The Home card and Rewind list share the intro's look. */
export const REWIND_COVER = THEME.intro;

/** Listening personality from the hour you listen most. */
export function personality(peak: number): { name: string; line: string } {
  const at = `${peak % 12 || 12} ${peak < 12 ? "AM" : "PM"}`;
  if (peak < 4) return { name: "The Night Owl", line: `You peak around ${at}. Sleep is overrated, apparently.` };
  if (peak < 8) return { name: "The Early Bird", line: `You're up at ${at} with a soundtrack. Impressive.` };
  if (peak < 12) return { name: "The Morning Starter", line: `You peak around ${at}, easing into the day one song at a time.` };
  if (peak < 17) return { name: "The Afternoon Rescuer", line: `You peak around ${at}, saving the workday one song at a time.` };
  if (peak < 21) return { name: "The Golden Hour Listener", line: `You peak around ${at}, winding down in style.` };
  return { name: "The Late Night Romantic", line: `You peak around ${at}, when the good songs come out.` };
}

const fmt = (n: number) => n.toLocaleString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Giant for short names, still big for long ones; sizes are % of the card's width. */
const fit = (s: string) => (s.length <= 6 ? "text-[34cqw]" : s.length <= 10 ? "text-[24cqw]" : s.length <= 18 ? "text-[16cqw]" : "text-[12cqw]");

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

function Thumb({ url, className = "size-[12cqw] rounded-[1cqw]" }: { url?: string; className?: string }) {
  const src = useBlob(url);
  return src ? <img src={src} alt="" className={cn("shrink-0 object-cover", className)} /> : <div className={cn("shrink-0 bg-black/20", className)} />;
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <div className="text-[4.4cqw] font-extrabold uppercase tracking-[0.12em]">{children}</div>
);
const Huge = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("mt-[3cqw] font-black leading-[0.85] tracking-[-0.055em] [overflow-wrap:anywhere]", className)}>{children}</div>
);
const Line = ({ children }: { children: ReactNode }) => (
  <div className="mt-[4cqw] text-[6.3cqw] font-bold leading-tight">{children}</div>
);
const Hi = ({ children }: { children: ReactNode }) => <span className="text-[var(--rw-hi)]">{children}</span>;

function Ranks({ items, from = 1 }: { items: Ranked[]; from?: number }) {
  return (
    <ol className="mt-[5cqw] flex flex-col gap-[2.5cqw]">
      {items.map((it, n) => (
        <li key={it.key} className="flex items-center gap-[3.5cqw]">
          <b className="w-[7cqw] text-[7.5cqw] font-black">{n + from}</b>
          <Thumb url={it.topAlbum?.thumb ?? it.thumb} />
          <span className="min-w-0">
            <span className="block truncate text-[6cqw] font-extrabold">{it.name}</span>
            {it.by ? <span className="block truncate text-[4.4cqw] font-semibold opacity-70">{it.by}</span> : null}
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
          <Kicker>{quarterLabel(r)}</Kicker>
          <Huge className="text-[17cqw]">Your quarter, on repeat.</Huge>
          <Line>Let's see what you've been up to.</Line>
        </>
      );
    case "setup":
      return (
        <>
          <Huge className="text-[15cqw]">Time is a construct.</Huge>
          <Huge className="mt-[5cqw] text-[15cqw]">We kept track anyway.</Huge>
        </>
      );
    case "minutes": {
      const hours = Math.round(r.minutes / 60);
      const days = r.minutes / 1440;
      return (
        <>
          <Kicker>You listened to</Kicker>
          <Huge className="text-[34cqw] text-[var(--rw-hi)]">{fmt(r.minutes)}</Huge>
          <Huge className="text-[9.6cqw]">minutes of music</Huge>
          <Line>
            {days >= 1
              ? `That's ${fmt(hours)} hours. About ${days.toFixed(1)} days of nonstop bangers.`
              : `That's ${fmt(hours)} ${hours === 1 ? "hour" : "hours"} of pure taste.`}
          </Line>
        </>
      );
    }
    case "variety":
      return (
        <>
          <Kicker>You played</Kicker>
          <Huge className="text-[34cqw]">{fmt(r.songs)}</Huge>
          <Huge className="text-[9.6cqw]">different songs</Huge>
          <Line>
            {r.newSongs ? (
              <>
                <Hi>{fmt(r.newSongs)}</Hi> of those were brand new to you!
              </>
            ) : (
              `From ${fmt(r.artistKeys.length)} artists. You get around.`
            )}
          </Line>
        </>
      );
    case "topArtist":
      return (
        <>
          <Kicker>Your top artist</Kicker>
          <Huge className={fit(s.item.name)}>{s.item.name}</Huge>
          <Line>
            <Hi>{fmt(s.item.plays)} plays.</Hi> Should we tell them, or will you?
          </Line>
        </>
      );
    case "artists":
      return (
        <>
          <Kicker>Your top artists</Kicker>
          <Huge className="text-[13cqw]">Your rotation, ranked.</Huge>
          <Ranks items={s.items} />
        </>
      );
    case "songs":
      return (
        <>
          <Kicker>Your top songs</Kicker>
          <Huge className={fit(s.items[0].name)}>{s.items[0].name}</Huge>
          {s.items[0].by ? <Line>{s.items[0].by}</Line> : null}
          <Ranks items={s.items.slice(1)} from={2} />
        </>
      );
    case "topAlbum":
      return (
        <>
          <Kicker>Your top album</Kicker>
          <Huge className={fit(s.item.name)}>{s.item.name}</Huge>
          <Line>
            <Hi>{fmt(s.item.minutes)} minutes.</Hi> Front to back, probably.
          </Line>
        </>
      );
    case "personality": {
      const p = personality(r.hours.indexOf(Math.max(...r.hours)));
      const max = Math.max(...r.hours, 1);
      return (
        <>
          <Kicker>Your listening personality</Kicker>
          <Huge className="text-[17cqw]">{p.name}</Huge>
          <Line>{p.line}</Line>
          <div className="mt-[6cqw] flex h-[30cqw] items-end gap-[0.7cqw]">
            {r.hours.map((m, i) => (
              <div key={i} className="flex-1 rounded-t-[0.6cqw]" style={{ height: `${Math.max(3, (m / max) * 100)}%`, background: m === max ? "var(--rw-hi)" : "rgb(0 0 0 / 0.22)" }} />
            ))}
          </div>
        </>
      );
    }
    case "genres":
      return (
        <>
          <Kicker>Your top genres</Kicker>
          <Huge className={fit(s.items[0])}>{cap(s.items[0])}</Huge>
          {s.items.slice(1, 3).map((g, n) => (
            <Huge key={g} className={cn("text-[11cqw]", n ? "opacity-70" : "opacity-85")}>{cap(g)}</Huge>
          ))}
          <Line>A little bit of everything. Tasteful.</Line>
        </>
      );
    case "newArtists":
      return (
        <>
          <Kicker>New to you</Kicker>
          <Huge className="text-[13cqw]">
            You found <Hi>{s.items.length}</Hi> new {s.items.length === 1 ? "artist" : "artists"}.
          </Huge>
          <Ranks items={s.items} />
        </>
      );
    case "summary": {
      const cover = r.topArtists[0]?.topAlbum?.thumb ?? r.topSongs[0]?.thumb;
      return (
        <div className="rounded-[5cqw] bg-white p-[6cqw] text-[#111]">
          <div className="mb-[5cqw] flex items-center gap-[4cqw]">
            <Thumb url={cover} className="size-[22cqw] rounded-[2cqw]" />
            <div>
              <div className="text-[3.6cqw] font-extrabold uppercase tracking-[0.12em] opacity-60">My Rewind</div>
              <div className="text-[7.5cqw] font-black tracking-[-0.03em]">{quarterLabel(r)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[4cqw]">
            {[
              ["Top artists", r.topArtists],
              ["Top songs", r.topSongs],
            ].map(([title, list]) => (
              <div key={title as string} className="min-w-0">
                <div className="mb-[1.5cqw] text-[3.6cqw] font-extrabold uppercase tracking-[0.12em] opacity-60">{title as string}</div>
                {(list as Ranked[]).map((it, n) => (
                  <div key={it.key} className="truncate text-[4.8cqw] font-extrabold leading-[1.45]">
                    {n + 1} {it.name}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-[4cqw] grid grid-cols-2 gap-[4cqw]">
            <div>
              <div className="text-[3.6cqw] font-extrabold uppercase tracking-[0.12em] opacity-60">Minutes</div>
              <div className="text-[9cqw] font-black">{fmt(r.minutes)}</div>
            </div>
            {r.genres?.[0] ? (
              <div className="min-w-0">
                <div className="text-[3.6cqw] font-extrabold uppercase tracking-[0.12em] opacity-60">Top genre</div>
                <div className="truncate text-[6.5cqw] font-black">{cap(r.genres[0])}</div>
              </div>
            ) : null}
          </div>
          <div className="mt-[4cqw] text-[3.4cqw] opacity-50">YTubic Plus</div>
        </div>
      );
    }
  }
}

/** The cover a slide shows tilted in its corner. */
function coverOf(s: SlideSpec): string | undefined {
  if (s.kind === "topArtist") return s.item.topAlbum?.thumb ?? s.item.thumb;
  if (s.kind === "topAlbum") return s.item.thumb;
  return undefined;
}

/** One slide: flat colour, big type at the bottom, a few shapes. Sized to the card (cqw). */
export function Slide({ s, r, current }: { s: SlideSpec; r: Rewind; current: boolean }) {
  const t = THEME[s.kind];
  const cover = useBlob(coverOf(s));
  return (
    <div
      data-slide={s.kind}
      {...(current && { "data-slide-current": s.kind })}
      aria-hidden={!current}
      className={cn("@container absolute inset-0 overflow-hidden", t.dark ? "text-[#111]" : "text-white")}
      style={{ background: t.bg, "--rw-hi": t.hi, visibility: current ? "visible" : "hidden" } as CSSProperties}
    >
      {s.kind === "intro" ? (
        <div className="absolute -left-[6cqw] -top-[3cqw] h-[58cqw] overflow-hidden text-[27cqw] font-black uppercase leading-[0.8] tracking-[-0.06em] text-[#ffd84d]">
          {/* Fenced into the top third: never behind the words. */}
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>Rewind</div>
          ))}
        </div>
      ) : null}
      {s.kind === "setup" ? <div className="absolute -right-[25cqw] -top-[25cqw] size-[80cqw] rounded-full bg-[#111]" /> : null}
      {s.kind === "genres" ? <div className="absolute -left-[22cqw] -top-[20cqw] size-[70cqw] rounded-full bg-[#ffd84d]" /> : null}
      {s.kind === "newArtists" ? <div className="absolute -right-[20cqw] -top-[10cqw] size-[60cqw] rounded-full bg-[#7a2cff]" /> : null}
      {cover ? (
        <img src={cover} alt="" className="absolute -right-[8cqw] top-[10cqw] aspect-square w-[56%] rotate-[8deg] rounded-[2cqw] object-cover shadow-[0_14px_40px_rgb(0_0_0/0.45)]" />
      ) : null}
      {/* Light grain over the flat colour. */}
      <div className="pointer-events-none absolute inset-0 opacity-20 [background:repeating-radial-gradient(circle_at_30%_30%,rgb(0_0_0/0.25)_0_1px,transparent_1px_3px)]" />
      <div className="absolute inset-x-0 bottom-0 px-[8cqw] pb-[10cqw]">
        <Body s={s} r={r} />
      </div>
    </div>
  );
}
