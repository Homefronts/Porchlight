import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isAiBlocked } from "@/lib/ai/use-ai";
import { fetchRadio } from "@/lib/innertube/radio";
import { queryClient } from "@/lib/query-client";
import { buildRewind } from "./build";
import { rewindLog, type RewindLog } from "./log";
import { readPalette } from "./palette";
import { quarterOf, type QuarterId } from "./quarter";
import type { Palette, Play, Ranked, Rewind } from "./types";

/** Only tracks that can make a top list are looked up, one at a time. */
export const MAX_LOOKUPS = 25;

type Meta = { title?: string; album?: string; albumId?: string; thumb?: string } | null;

export type SealDeps = {
  log: RewindLog;
  lookup: (videoId: string) => Promise<Meta>;
  readPalette: (url: string) => Promise<Palette | null>;
  excludeAi: (p: Play) => boolean;
  now: () => number;
  pauseMs: number;
  /** Sealing is final, so it waits for a connection (covers, lookups). */
  online: () => boolean;
  /** An artist's Last.fm tags, most used first. Without it there are no genres. */
  artistTags?: (artist: string) => Promise<string[]>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fill album/cover for the likely top tracks that lack them, and the title of
 * imported plays (Takeout's titles carry a localised "Watched" prefix).
 */
async function fillMissing(plays: Play[], deps: SealDeps): Promise<void> {
  const counts = new Map<string, number>();
  const needs = (p: Play) => p.source === "takeout" || !p.thumb || !p.album;
  for (const p of plays) if (p.counted && needs(p)) counts.set(p.videoId, (counts.get(p.videoId) ?? 0) + 1);
  const ids = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_LOOKUPS).map(([id]) => id);
  const found = new Map<string, Meta>();
  for (const id of ids) {
    let m = await deps.log.meta<Meta>(id);
    if (m === undefined) {
      try {
        m = await deps.lookup(id);
        await deps.log.setMeta(id, m); // "not found" is cached too; a failure is retried next time
      } catch {
        m = null;
      }
      if (deps.pauseMs) await sleep(deps.pauseMs);
    }
    found.set(id, m);
  }
  for (const p of plays) {
    const m = found.get(p.videoId);
    if (!m) continue;
    if (p.source === "takeout" && m.title) p.title = m.title;
    p.album ??= m.album;
    p.albumId ??= m.albumId;
    p.thumb ??= m.thumb;
  }
}

/** Covers the story will show, each read once. */
export function coversOf(r: Rewind): string[] {
  const urls = [
    ...r.topArtists.map((a) => a.topAlbum?.thumb ?? a.thumb),
    r.topSongs[0]?.thumb,
    r.topAlbums[0]?.thumb,
    ...r.newArtists.map((a) => a.thumb),
  ];
  return [...new Set(urls.filter((u): u is string => !!u))];
}

async function withPalettes(r: Rewind, deps: Pick<SealDeps, "readPalette">): Promise<Rewind> {
  const palette: Record<string, Palette> = {};
  for (const url of coversOf(r)) {
    const p = await deps.readPalette(url).catch(() => null);
    if (p) palette[url] = p;
  }
  return { ...r, palette };
}

async function known(log: RewindLog, before: QuarterId) {
  const earlier = (await log.rewinds()).filter((r) => r.quarter < before);
  return {
    knownArtists: new Set(earlier.flatMap((r) => r.artistKeys ?? [])),
    // With no earlier rewind every song would look new, so the count is left out.
    knownSongs: earlier.length ? new Set(earlier.flatMap((r) => r.songKeys ?? [])) : undefined,
  };
}

// Tags people use that aren't genres: "seen live", "favorites", "2010s", ...
const NOT_GENRE = /seen live|favou?rite|albums? i own|listen|^\d/i;

/** Top genres: each artist's first few real tags, weighted by your minutes with them. */
export function topGenres(artists: Ranked[], tags: Map<string, string[]>): string[] {
  const score = new Map<string, number>();
  for (const a of artists) {
    const own = (tags.get(a.key) ?? [])
      .map((t) => t.toLowerCase())
      .filter((t) => !NOT_GENRE.test(t) && t !== a.name.toLowerCase())
      .slice(0, 3);
    for (const g of own) score.set(g, (score.get(g) ?? 0) + a.minutes);
  }
  return [...score].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([g]) => g);
}

async function withGenres(r: Rewind, deps: Pick<SealDeps, "artistTags">): Promise<Rewind> {
  if (!deps.artistTags) return r;
  const artists = [...new Map([...r.topArtists, ...r.newArtists].map((a) => [a.key, a])).values()];
  const tags = new Map<string, string[]>();
  for (const a of artists) tags.set(a.key, await deps.artistTags(a.name).catch(() => []));
  const genres = topGenres(artists, tags);
  return genres.length ? { ...r, genres } : r;
}

/** Build a quarter's rewind without saving it (also the "so far" preview). */
export async function previewQuarter(q: QuarterId, deps: SealDeps): Promise<Rewind | null> {
  const plays = await deps.log.plays(q);
  if (!plays.length) return null;
  await fillMissing(plays, deps);
  const r = buildRewind(q, plays, { excludeAi: deps.excludeAi, ...(await known(deps.log, q)), now: deps.now() });
  return r && withPalettes(await withGenres(r, deps), deps);
}

/** Seal an ended quarter: build, save, drop its raw plays. Runs once per quarter. */
export async function sealQuarter(q: QuarterId, deps: SealDeps): Promise<Rewind | null> {
  const existing = await deps.log.rewind(q);
  if (existing) {
    await deps.log.dropPlays(q); // late arrivals: the rewind is frozen
    return existing;
  }
  const r = await previewQuarter(q, deps);
  if (r) await deps.log.saveRewind(r);
  else await deps.log.dropPlays(q);
  return r;
}

async function lookupTrack(videoId: string): Promise<Meta> {
  const t = (await fetchRadio(videoId)).find((i) => i.id === videoId);
  return t ? { title: t.title, album: t.album, albumId: t.albumId, thumb: t.thumbnails[t.thumbnails.length - 1]?.url } : null;
}

export const appSealDeps: SealDeps = {
  log: rewindLog,
  lookup: lookupTrack,
  readPalette,
  // "Play anyway" plays count; otherwise follow the AI switch as it is now.
  excludeAi: (p) => !p.aiAllowed && isAiBlocked(p),
  now: Date.now,
  pauseMs: 300,
  online: () => navigator.onLine,
  // Only artist names go out, with no account; empty when the build has no Last.fm key.
  artistTags: (artist) => invoke<string[]>("lastfm_artist_tags", { artist }),
};

/** Seal every quarter that has ended and still holds raw plays (oldest first). */
export async function sealEnded(deps: SealDeps): Promise<void> {
  if (!deps.online()) return;
  const current = quarterOf(deps.now());
  for (const q of (await deps.log.openQuarters()).filter((q) => q < current).sort()) await sealQuarter(q, deps);
}

let sealing: Promise<void> | null = null;

/** Seal what's due, once at a time; the Rewind list refreshes after. */
export function ensureSealed(): Promise<void> {
  sealing ??= sealEnded(appSealDeps)
    .then(() => queryClient.invalidateQueries({ queryKey: ["rewinds"] }))
    .finally(() => {
      sealing = null;
    });
  return sealing;
}

/** Mount once in AppShell: seal ended quarters when the app is idle, never on the startup path. */
export function useRewindScheduler(): void {
  useEffect(() => {
    const run = () => void ensureSealed();
    // Launched offline: seal once the connection is back.
    window.addEventListener("online", run);
    const idle = "requestIdleCallback" in window;
    const id = idle ? window.requestIdleCallback(run, { timeout: 60_000 }) : window.setTimeout(run, 10_000);
    return () => {
      window.removeEventListener("online", run);
      if (idle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);
}
