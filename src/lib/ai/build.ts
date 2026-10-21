/**
 * Pure decisions for the daily AI data job (`scripts/ai-data/run.ts`).
 * The job does the network work; everything that decides what gets
 * published lives here so it can be tested against fixtures.
 */
import { normalizeName, normalizeTitle, type AiData } from "./match";

const MIN_MAYBE_NAME = 4;

/** Spotify's public artist embed page → name and top track titles. */
export function parseSpotifyEmbed(
  html: string,
): { name: string; tracks: string[] } | null {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try {
    const e = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
    if (typeof e?.name !== "string" || !Array.isArray(e.trackList)) return null;
    const tracks = e.trackList
      .map((t: { title?: unknown }) => t?.title)
      .filter((t: unknown): t is string => typeof t === "string");
    return { name: e.name, tracks };
  } catch {
    return null;
  }
}

export function parseCsvArtists(
  csv: string,
): { name: string; spotifyId: string }[] {
  const out: { name: string; spotifyId: string }[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    // Name may be quoted and contain commas; the id never does.
    const cut = line.lastIndexOf(",");
    if (cut < 0) continue;
    let name = line.slice(0, cut).trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1).replace(/""/g, '"');
    }
    const spotifyId = line.slice(cut + 1).trim();
    if (name && spotifyId) out.push({ name, spotifyId });
  }
  return out;
}

/** Channel ids from CevvalKoala's uBlock list; @handles can't be matched. */
export function parseYoutubeBlocklist(txt: string): string[] {
  const ids = new Set<string>();
  for (const line of txt.split(/\r?\n/)) {
    if (line.startsWith("!") || line.startsWith("[")) continue;
    for (const m of line.matchAll(/href\*="(UC[\w-]{22})"/g)) ids.add(m[1]);
  }
  return [...ids];
}

type Run = { text?: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } };

function* listItems(o: unknown): Generator<{ flexColumns?: unknown[] }> {
  if (Array.isArray(o)) for (const v of o) yield* listItems(v);
  else if (o && typeof o === "object") {
    const r = (o as Record<string, unknown>).musicResponsiveListItemRenderer;
    if (r) yield r as { flexColumns?: unknown[] };
    else for (const v of Object.values(o)) yield* listItems(v);
  }
}

const runsOf = (col: unknown): Run[] =>
  (col as { musicResponsiveListItemFlexColumnRenderer?: { text?: { runs?: Run[] } } })
    ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];

/**
 * A YouTube Music song search → song titles per artist channel whose name
 * matches `artistName` exactly (normalised), so "X Unplugged" lookalikes
 * don't count.
 */
export function channelsFromSongSearch(
  json: unknown,
  artistName: string,
): Map<string, { name: string; titles: string[] }> {
  const want = normalizeName(artistName);
  const out = new Map<string, { name: string; titles: string[] }>();
  for (const item of listItems(json)) {
    const [c0, c1] = item.flexColumns ?? [];
    const title = runsOf(c0)[0]?.text;
    if (!title) continue;
    for (const r of runsOf(c1)) {
      const id = r.navigationEndpoint?.browseEndpoint?.browseId;
      if (!id?.startsWith("UC") || !r.text || normalizeName(r.text) !== want) continue;
      const e = out.get(id) ?? { name: r.text, titles: [] };
      e.titles.push(title);
      out.set(id, e);
    }
  }
  return out;
}

// "Intro" or "Home" overlap by chance; a real namesake must not be confirmed.
const distinctive = (t: string) => t.includes(" ") || t.length >= 8;

/** Confirmed only when a distinctive song title overlaps; otherwise just a namesake. */
export function decideChannel(
  spotifyTracks: string[] | null,
  ytSongTitles: string[],
): "ai" | "maybe" {
  if (!spotifyTracks) return "maybe";
  const sp = new Set(spotifyTracks.map(normalizeTitle).filter(distinctive));
  return ytSongTitles.some((t) => sp.has(normalizeTitle(t))) ? "ai" : "maybe";
}

type JobState = {
  artists: Record<string, { channels: Record<string, { name: string; verdict: "ai" | "maybe" }> }>;
};

/**
 * Confirmed channels to publish: only from artists still on a list (a
 * delisted artist was likely a mistake), plus the YouTube list's channel
 * ids, which carry no name.
 */
export function confirmedFromState(
  state: JobState,
  listedSpotifyIds: Set<string>,
  youtubeIds: string[],
): Record<string, string> {
  const confirmed: Record<string, string> = {};
  for (const id of youtubeIds) confirmed[id] = "";
  for (const [spId, a] of Object.entries(state.artists)) {
    if (!listedSpotifyIds.has(spId)) continue;
    for (const [cid, c] of Object.entries(a.channels)) if (c.verdict === "ai") confirmed[cid] = c.name;
  }
  return confirmed;
}

const DAY_MS = 86_400_000;

/** A Spotify miss is rechecked after a day, a good check after two weeks. */
export function isDue(a: { checkedAt: string; spotifyOk: boolean }, now: number): boolean {
  return now - Date.parse(a.checkedAt) > (a.spotifyOk ? 14 : 1) * DAY_MS;
}

export function spotifyStatus(
  attempted: number,
  failed: number,
  parsedAny: boolean,
): "ok" | "degraded" {
  if (attempted === 0) return "ok";
  return failed > attempted / 2 || !parsedAny ? "degraded" : "ok";
}

export function mergeResults(
  prev: AiData | null,
  next: Partial<AiData>,
  degraded: boolean,
): AiData {
  // A failed list download keeps that list's previous results too.
  const keepPrev = degraded || next.status?.lists === "stale";
  const confirmed = keepPrev
    ? { ...(prev?.confirmed ?? {}), ...(next.confirmed ?? {}) }
    : { ...(next.confirmed ?? {}) };
  const confirmedNames = new Set(Object.values(confirmed).map(normalizeName));
  const maybeSource = [
    ...(next.maybeNames ?? prev?.maybeNames ?? []),
    ...(keepPrev && next.status?.lists === "stale" ? (prev?.maybeNames ?? []) : []),
  ];
  const maybeNames = [...new Set(maybeSource)]
    .filter((n) => n.length >= MIN_MAYBE_NAME && !confirmedNames.has(n))
    .sort();
  return {
    version: 1,
    generatedAt: next.generatedAt ?? new Date().toISOString(),
    status: {
      spotify: degraded ? "degraded" : "ok",
      lists: next.status?.lists ?? "ok",
      message: next.status?.message ?? null,
    },
    confirmed,
    maybeNames,
    sources: next.sources ?? prev?.sources ?? [],
  };
}
