import { useEffect } from "react";
import { isAiBlocked } from "@/lib/ai/use-ai";
import { fetchRadio } from "@/lib/innertube/radio";
import { buildRewind } from "./build";
import { rewindLog, type RewindLog } from "./log";
import { readPalette } from "./palette";
import { previousQuarter, quarterOf, type QuarterId } from "./quarter";
import type { Palette, Play, Rewind } from "./types";

/** Only tracks that can make a top list are looked up, one at a time. */
export const MAX_LOOKUPS = 25;

type Meta = { album?: string; albumId?: string; thumb?: string } | null;

export type SealDeps = {
  log: RewindLog;
  lookup: (videoId: string) => Promise<Meta>;
  readPalette: (url: string) => Promise<Palette | null>;
  excludeAi: (p: Play) => boolean;
  now: () => number;
  pauseMs: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fill album/cover for the likely top tracks that lack them (imported plays). */
async function fillMissing(plays: Play[], deps: SealDeps): Promise<void> {
  const counts = new Map<string, number>();
  for (const p of plays) if (p.counted && (!p.thumb || !p.album)) counts.set(p.videoId, (counts.get(p.videoId) ?? 0) + 1);
  const ids = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_LOOKUPS).map(([id]) => id);
  const found = new Map<string, Meta>();
  for (const id of ids) {
    let m = await deps.log.meta<Meta>(id);
    if (m === undefined) {
      m = await deps.lookup(id).catch(() => null);
      await deps.log.setMeta(id, m);
      if (deps.pauseMs) await sleep(deps.pauseMs);
    }
    found.set(id, m);
  }
  for (const p of plays) {
    const m = found.get(p.videoId);
    if (!m) continue;
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
  if (existing) return existing;
  const r = await previewQuarter(q, deps);
  if (r) await deps.log.saveRewind(r);
  else await deps.log.dropPlays(q);
  return r;
}

async function lookupTrack(videoId: string): Promise<Meta> {
  const t = (await fetchRadio(videoId)).find((i) => i.id === videoId);
  return t ? { album: t.album, albumId: t.albumId, thumb: t.thumbnails[t.thumbnails.length - 1]?.url } : null;
}

export const appSealDeps: SealDeps = {
  log: rewindLog,
  lookup: lookupTrack,
  readPalette,
  // "Play anyway" plays count; otherwise follow the AI switch as it is now.
  excludeAi: (p) => !p.aiAllowed && isAiBlocked(p),
  now: Date.now,
  pauseMs: 300,
};

let sealing: Promise<Rewind | null> | null = null;

/** The last ended quarter's rewind, building it if needed. */
export function ensureLastRewind(): Promise<Rewind | null> {
  sealing ??= sealQuarter(previousQuarter(quarterOf(Date.now())), appSealDeps).finally(() => {
    sealing = null;
  });
  return sealing;
}

/** Mount once in AppShell: seal the last quarter when the app is idle, never on the startup path. */
export function useRewindScheduler(): void {
  useEffect(() => {
    const run = () => void ensureLastRewind();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 60_000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 10_000);
    return () => clearTimeout(t);
  }, []);
}
