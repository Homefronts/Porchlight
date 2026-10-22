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

const rings = (c: string) => `repeating-radial-gradient(circle at 85% 0%, ${c} 0 2.5cqmin, transparent 2.5cqmin 7cqmin)`;
const stripes = (c: string) => `repeating-linear-gradient(-45deg, ${c} 0 3cqmin, transparent 3cqmin 9cqmin)`;
const bands = (c: string) => `repeating-linear-gradient(0deg, ${c} 0 2cqmin, transparent 2cqmin 8cqmin)`;
const dots = (c: string) => `radial-gradient(${c} 1.6cqmin, transparent 1.7cqmin) 0 0 / 8cqmin 8cqmin`;
const grid = (c: string) => `linear-gradient(${c} 0.6cqmin, transparent 0.6cqmin) 0 0 / 10cqmin 10cqmin, linear-gradient(90deg, ${c} 0.6cqmin, transparent 0.6cqmin) 0 0 / 10cqmin 10cqmin`;

/** Each slide's pattern (CSS background), drawn in a soft shade of its own colour. */
const PATTERN: Record<SlideSpec["kind"], (c: string) => string> = {
  intro: dots,
  setup: dots,
  minutes: rings,
  variety: stripes,
  topArtist: grid,
  artists: rings,
  songs: stripes,
  topAlbum: dots,
  personality: bands,
  genres: grid,
  newArtists: stripes,
  summary: dots,
};

// Diagonal stripes repeat every 9cqmin across, which is 12.73cqmin along x or y.
const drift = (dx: string, dy: string, sec: number) => ({ "--dx": dx, "--dy": dy, animation: `rw-drift ${sec}s linear infinite` });

/** How each slide's pattern moves: every slide its own direction, speed or motion. */
const MOTION: Record<SlideSpec["kind"], CSSProperties> = {
  intro: drift("-8cqmin", "8cqmin", 9),
  setup: drift("8cqmin", "-8cqmin", 7),
  minutes: { animation: "rw-breathe 6s ease-in-out infinite" },
  variety: drift("12.73cqmin", "0", 4),
  topArtist: drift("10cqmin", "10cqmin", 8),
  artists: { animation: "rw-turn 40s linear infinite" },
  songs: drift("-12.73cqmin", "0", 5),
  topAlbum: drift("8cqmin", "0", 6),
  personality: drift("0", "-8cqmin", 5),
  genres: drift("-10cqmin", "10cqmin", 9),
  newArtists: drift("0", "-12.73cqmin", 6),
  summary: drift("8cqmin", "8cqmin", 12),
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
/**
 * As big as `max` (in % of the card width), but small enough that the longest
 * word fits on one line: headings wrap at spaces only, never mid-word.
 */
export function fit(text: string, max = 34): CSSProperties {
  const longest = Math.max(...text.split(/s+/).map((w) => w.length));
  // ~0.62em a character for this heavy, tightly tracked type; 80cqw of room.
  return { fontSize: `${Math.min(max, 80 / (longest * 0.62)).toFixed(1)}cqw` };
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

function Thumb({ url, className = "size-[12cqw] rounded-[1cqw]" }: { url?: string; className?: string }) {
  const src = useBlob(url);
  return src ? <img src={src} alt="" className={cn("shrink-0 object-cover", className)} /> : <div className={cn("shrink-0 bg-black/20", className)} />;
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <div className="text-[4.4cqw] font-extrabold uppercase tracking-[0.12em]">{children}</div>
);
const Huge = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <div className={cn("mt-[3cqw] font-black leading-[0.85] tracking-[-0.055em]", className)} style={style}>{children}</div>
);
const Line = ({ children }: { children: ReactNode }) => (
  <div className="mt-[4cqw] text-[6.3cqw] font-bold leading-tight">{children}</div>
);
const Hi = ({ children }: { children: ReactNode }) => <span className="text-[var(--rw-hi)]">{children}</span>;

function Ranks({ items, from = 1 }: { items: Ranked[]; from?: number }) {
  return (
    <ol className="mt-[5cqw] flex flex-col gap-[2.5cqw]">
      {items.map((it, n) => (
        <li key={it.key} className="flex items-center gap-[3.5cqw]" style={{ animation: `rw-rise 0.5s ease-out ${0.15 + n * 0.1}s both` }}>
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
          <Huge style={fit("Your Rewind", 24)}>Your Rewind</Huge>
          <Line>Your quarter, on repeat. Let's see what you've been up to.</Line>
        </>
      );
    case "setup":
      return (
        <>
          <Huge style={fit("Time is a construct.", 15)}>Time is a construct.</Huge>
          <Huge className="mt-[5cqw]" style={fit("Time is a construct.", 15)}>We kept track anyway.</Huge>
        </>
      );
    case "minutes": {
      const hours = Math.round(r.minutes / 60);
      const days = r.minutes / 1440;
      return (
        <>
          <Kicker>You listened to</Kicker>
          <Huge className="text-[var(--rw-hi)]" style={fit(fmt(r.minutes))}>{fmt(r.minutes)}</Huge>
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
          <Huge style={fit(fmt(r.songs))}>{fmt(r.songs)}</Huge>
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
          <Huge style={fit(s.item.name)}>{s.item.name}</Huge>
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
          <Huge style={fit(s.items[0].name)}>{s.items[0].name}</Huge>
          {s.items[0].by ? <Line>{s.items[0].by}</Line> : null}
          <Ranks items={s.items.slice(1)} from={2} />
        </>
      );
    case "topAlbum":
      return (
        <>
          <Kicker>Your top album</Kicker>
          <Huge style={fit(s.item.name)}>{s.item.name}</Huge>
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
          <Huge style={fit(p.name, 17)}>{p.name}</Huge>
          <Line>{p.line}</Line>
          <div className="mt-[6cqw] flex h-[30cqw] items-end gap-[0.7cqw]">
            {r.hours.map((m, i) => (
              <div
                key={i}
                className="flex-1 origin-bottom rounded-t-[0.6cqw]"
                style={{
                  height: `${Math.max(3, (m / max) * 100)}%`,
                  background: m === max ? "var(--rw-hi)" : "rgb(0 0 0 / 0.22)",
                  animation: `rw-grow 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) ${0.2 + i * 0.03}s both`,
                }}
              />
            ))}
          </div>
        </>
      );
    }
    case "genres":
      return (
        <>
          <Kicker>Your top genres</Kicker>
          <Huge style={fit(s.items[0])}>{cap(s.items[0])}</Huge>
          {s.items.slice(1, 3).map((g, n) => (
            <Huge key={g} className={n ? "opacity-70" : "opacity-85"} style={fit(g, 11)}>{cap(g)}</Huge>
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
        <div className="rounded-[5cqw] bg-white p-[6cqw] text-[#111]" style={{ animation: "rw-pop 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.3) both" }}>
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

/**
 * One slide, filling the window: flat colour and a moving pattern edge to edge,
 * the words in a frame bottom-left and the shapes in one top-right. Each frame
 * is a container no wider than 1/1.2 of the window's height, and everything
 * inside is sized in % of it (cqw), so text stays big but always fits.
 */
export function Slide({ s, r, current }: { s: SlideSpec; r: Rewind; current: boolean }) {
  const t = THEME[s.kind];
  const cover = useBlob(coverOf(s));
  return (
    <div
      data-slide={s.kind}
      {...(current && { "data-slide-current": s.kind })}
      aria-hidden={!current}
      className={cn("absolute inset-0 overflow-hidden [container-type:size]", t.dark ? "text-[#111]" : "text-white")}
      style={{ background: t.bg, "--rw-hi": t.hi, visibility: current ? "visible" : "hidden" } as CSSProperties}
    >
      {/* A pattern in the top half, faded out before it reaches the words. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60%] overflow-hidden [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">
        {/* Oversized, so drifting by one pattern period loops seamlessly. */}
        <div
          className="absolute -inset-[25cqmin]"
          style={{ background: PATTERN[s.kind](t.dark ? "rgb(0 0 0 / 0.13)" : "rgb(255 255 255 / 0.14)"), ...MOTION[s.kind] } as CSSProperties}
        />
      </div>
      <div className="@container absolute right-0 top-0 h-full w-[min(100cqw,83.3cqh)]">
      {s.kind === "intro" ? (
        // A vinyl record spinning in from the corner, the quarter on its label.
        <div className="absolute -right-[30cqw] -top-[24cqw] grid size-[100cqw] place-items-center rounded-full bg-[#111] shadow-[0_14px_40px_rgb(0_0_0/0.35)] [background-image:repeating-radial-gradient(circle,#111_0_1.1cqw,#2a2a2a_1.1cqw_1.5cqw)] motion-safe:animate-[spin_14s_linear_infinite]">
          <div className="grid size-[34cqw] place-items-center rounded-full bg-[#ffd84d] text-[12cqw] font-black tracking-[-0.05em] text-[#111]">
            {r.quarter.split("-")[1]}
          </div>
        </div>
      ) : null}
      {s.kind === "setup" ? <div className="absolute -right-[25cqw] -top-[25cqw] size-[80cqw] rounded-full bg-[#111]" style={{ animation: "rw-breathe 5s ease-in-out infinite" }} /> : null}
      {s.kind === "genres" ? <div className="absolute -left-[22cqw] -top-[20cqw] size-[70cqw] rounded-full bg-[#ffd84d]" style={{ animation: "rw-orbit 9s linear infinite" }} /> : null}
      {s.kind === "newArtists" ? <div className="absolute -right-[20cqw] -top-[10cqw] h-[52cqw] w-[62cqw] rounded-[48%] bg-[#7a2cff]" style={{ animation: "rw-wobble 6s ease-in-out infinite" }} /> : null}
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute -right-[8cqw] top-[10cqw] aspect-square w-[56%] rotate-[8deg] rounded-[2cqw] object-cover shadow-[0_14px_40px_rgb(0_0_0/0.45)]"
          style={{
            animation: s.kind === "topAlbum" ? "rw-spin-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1.2) both" : "rw-float 5s ease-in-out infinite",
          }}
        />
      ) : null}
      </div>
      {/* Light grain over the flat colour. */}
      <div className="pointer-events-none absolute inset-0 opacity-20 [background:repeating-radial-gradient(circle_at_30%_30%,rgb(0_0_0/0.25)_0_1px,transparent_1px_3px)]" />
      <div className="@container absolute bottom-0 left-0 w-[min(100cqw,83.3cqh)] px-[8cqw] pb-[10cqw]">
        <Body s={s} r={r} />
      </div>
    </div>
  );
}
