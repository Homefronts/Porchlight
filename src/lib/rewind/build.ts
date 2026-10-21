import { normalizeName } from "@/lib/ai/match";
import type { QuarterId } from "./quarter";
import type { Play, Ranked, Rewind } from "./types";

/** Below this there's not enough to tell a story. */
export const MIN_MINUTES = 60;
export const MIN_SONGS = 10;
/** Takeout has no play length; assume a typical song. */
export const IMPORTED_DEFAULT_SEC = 210;
const TOP = 5;

type Acc = Ranked & { albums?: Map<string, { id?: string; name: string; thumb?: string; plays: number }> };

export const artistKey = (a: { id?: string; name: string }) => a.id || normalizeName(a.name);

function bump(m: Map<string, Acc>, key: string, name: string, sec: number, counted: boolean, thumb?: string): Acc {
  let e = m.get(key);
  if (!e) m.set(key, (e = { key, name, plays: 0, minutes: 0, thumb }));
  e.minutes += sec / 60;
  if (counted) e.plays++;
  e.thumb ??= thumb;
  return e;
}

function top(m: Map<string, Acc>, n = TOP): Ranked[] {
  return [...m.values()]
    .filter((e) => e.plays > 0)
    .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
    .slice(0, n)
    .map(({ albums, ...e }) => {
      const best = albums && [...albums.values()].sort((a, b) => b.plays - a.plays)[0];
      return { ...e, minutes: Math.round(e.minutes), ...(best && { topAlbum: { id: best.id, name: best.name, thumb: best.thumb } }) };
    });
}

/** One pass over the quarter's plays; null when there's too little to show. */
export function buildRewind(
  q: QuarterId,
  plays: Play[],
  opts: { excludeAi: (p: Play) => boolean; knownArtists: Set<string>; now: number },
): Rewind | null {
  const artists = new Map<string, Acc>();
  const songs = new Map<string, Acc>();
  const albums = new Map<string, Acc>();
  const hours = new Array<number>(24).fill(0);
  let sec = 0;
  let counted = 0;

  for (const p of plays) {
    if (opts.excludeAi(p)) continue;
    const s = p.playedSec || (p.source === "takeout" ? IMPORTED_DEFAULT_SEC : 0);
    sec += s;
    hours[new Date(p.startedAt).getHours()] += s / 60;
    if (p.counted) counted++;
    bump(songs, p.videoId, p.title, s, p.counted, p.thumb);
    const albumKey = p.album ? p.albumId || `${normalizeName(p.album)}|${artistKey(p.artists[0] ?? { name: "" })}` : null;
    if (albumKey) bump(albums, albumKey, p.album!, s, p.counted, p.thumb);
    for (const a of p.artists) {
      const e = bump(artists, artistKey(a), a.name, s, p.counted, p.thumb);
      if (p.album && p.counted) {
        e.albums ??= new Map();
        const al = e.albums.get(albumKey!) ?? { id: p.albumId, name: p.album, thumb: p.thumb, plays: 0 };
        al.plays++;
        e.albums.set(albumKey!, al);
      }
    }
  }

  if (sec / 60 < MIN_MINUTES || songs.size < MIN_SONGS) return null;
  const fresh = new Map([...artists].filter(([k]) => !opts.knownArtists.has(k)));
  return {
    quarter: q,
    builtAt: opts.now,
    minutes: Math.round(sec / 60),
    plays: counted,
    topArtists: top(artists),
    topSongs: top(songs),
    topAlbums: top(albums),
    hours: hours.map(Math.round),
    newArtists: top(fresh),
    artistKeys: [...artists.keys()],
  };
}
