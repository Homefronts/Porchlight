import { useEffect } from "react";
import { isAiBlocked } from "@/lib/ai/use-ai";
import { fetchRadio } from "@/lib/innertube/radio";
import { queryClient } from "@/lib/query-client";
import { buildRewind } from "./build";
import { rewindLog, type RewindLog } from "./log";
import { readPalette } from "./palette";
import { quarterOf, type QuarterId } from "./quarter";
import type { Palette, Play, Rewind } from "./types";

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

async function knownArtists(log: RewindLog, before: QuarterId): Promise<Set<string>> {
  const known = new Set<string>();
  for (const r of await log.rewinds()) if (r.quarter < before) for (const k of r.artistKeys ?? []) known.add(k);
  return known;
}

/** Build a quarter's rewind without saving it (also the "so far" preview). */
export async function previewQuarter(q: QuarterId, deps: SealDeps): Promise<Rewind | null> {
  const plays = await deps.log.plays(q);
  if (!plays.length) return null;
  await fillMissing(plays, deps);
  const r = buildRewind(q, plays, { excludeAi: deps.excludeAi, knownArtists: await knownArtists(deps.log, q), now: deps.now() });
  return r && withPalettes(r, deps);
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
