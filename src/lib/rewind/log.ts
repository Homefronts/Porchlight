import { createStore, del, get, getMany, keys, set } from "idb-keyval";
import { quarterOf, type QuarterId } from "./quarter";
import type { Play, Rewind } from "./types";

export type Kv = {
  get<T>(k: string): Promise<T | undefined>;
  getMany<T>(ks: string[]): Promise<(T | undefined)[]>;
  set(k: string, v: unknown): Promise<void>;
  del(k: string): Promise<void>;
  keys(): Promise<string[]>;
};

/** Safety net for imports; a heavy listener logs a few thousand plays a quarter. */
export const MAX_PLAYS_PER_QUARTER = 20_000;
/** An imported play this close to a logged one is the same listen. */
const SAME_PLAY_MS = 60_000;

// One record per play, so logging a track is a single small write.
const playPrefix = (q: QuarterId) => `play:${q}:`;
const playKey = (p: Play) => `${playPrefix(quarterOf(p.startedAt))}${String(p.startedAt).padStart(15, "0")}:${p.videoId}`;
const rewindKey = (q: QuarterId) => `rewind:${q}`;

export function createLog(kv: Kv) {
  // One write at a time, so an import and a track change can't interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };
  const playKeys = async (q: QuarterId) => (await kv.keys()).filter((k) => k.startsWith(playPrefix(q))).sort();
  const read = async (q: QuarterId) =>
    (await kv.getMany<Play>(await playKeys(q))).filter((p): p is Play => !!p);
  const dropAll = async (q: QuarterId) => {
    for (const k of await playKeys(q)) await kv.del(k);
  };

  return {
    append: (p: Play) => serial(() => kv.set(playKey(p), p)),

    plays: (q: QuarterId) => serial(() => read(q)),

    /** Quarters that still hold raw plays (open, or not sealed yet). */
    openQuarters: () =>
      serial(async () => [
        ...new Set((await kv.keys()).filter((k) => k.startsWith("play:")).map((k) => k.split(":")[1] as QuarterId)),
      ]),

    addImported: (q: QuarterId, ps: Play[]) =>
      serial(async () => {
        const have = await read(q);
        const byVideo = new Map<string, number[]>();
        for (const p of have) byVideo.set(p.videoId, [...(byVideo.get(p.videoId) ?? []), p.startedAt]);
        const room = Math.max(0, MAX_PLAYS_PER_QUARTER - have.length);
        const candidates = ps
          .filter((p) => {
            if (quarterOf(p.startedAt) !== q) return false;
            const times = byVideo.get(p.videoId) ?? [];
            if (times.some((t) => Math.abs(t - p.startedAt) < SAME_PLAY_MS)) return false;
            byVideo.set(p.videoId, [...times, p.startedAt]);
            return true;
          })
          .sort((a, b) => a.startedAt - b.startedAt);
        // Over the cap: keep the newest.
        const fresh = room > 0 ? candidates.slice(-room) : [];
        for (const p of fresh) await kv.set(playKey(p), p);
        return fresh.length;
      }),

    saveRewind: (r: Rewind) =>
      serial(async () => {
        await kv.set(rewindKey(r.quarter), r);
        await dropAll(r.quarter);
      }),

    /** Raw plays nothing will be built from: a quarter too small to show, or late arrivals. */
    dropPlays: (q: QuarterId) => serial(() => dropAll(q)),

    rewind: (q: QuarterId) => serial(() => kv.get<Rewind>(rewindKey(q))),

    rewinds: () =>
      serial(async () => {
        const ks = (await kv.keys()).filter((k) => k.startsWith("rewind:")).sort().reverse();
        return (await kv.getMany<Rewind>(ks)).filter((r): r is Rewind => !!r);
      }),

    /** Small per-video cache for metadata looked up when sealing. */
    meta: <T>(videoId: string) => kv.get<T>(`meta:${videoId}`),
    setMeta: (videoId: string, v: unknown) => kv.set(`meta:${videoId}`, v),

    clear: () =>
      serial(async () => {
        for (const k of await kv.keys()) await kv.del(k);
      }),
  };
}

export type RewindLog = ReturnType<typeof createLog>;

const store = typeof indexedDB !== "undefined" ? createStore("ytubic-rewind", "kv") : undefined;

// Like src/lib/store/idb-storage.ts: storage failures never reach playback.
const quiet = <T>(p: Promise<T>, fallback: T) =>
  p.catch((e) => {
    console.warn("[rewind] storage failed:", e);
    return fallback;
  });

export const rewindLog = createLog({
  get: (k) => (store ? quiet(get(k, store), undefined) : Promise.resolve(undefined)),
  getMany: (ks) => (store ? quiet(getMany(ks, store), []) : Promise.resolve([])),
  set: (k, v) => (store ? quiet(set(k, v, store), undefined) : Promise.resolve()),
  del: (k) => (store ? quiet(del(k, store), undefined) : Promise.resolve()),
  keys: async () => (store ? (await quiet(keys(store), [])).map(String) : []),
});
