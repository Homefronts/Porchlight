import { createStore, del, get, keys, set } from "idb-keyval";
import { quarterOf, type QuarterId } from "./quarter";
import type { Play, Rewind } from "./types";

export type Kv = {
  get<T>(k: string): Promise<T | undefined>;
  set(k: string, v: unknown): Promise<void>;
  del(k: string): Promise<void>;
  keys(): Promise<string[]>;
};

/** Safety net; a heavy listener logs a few thousand plays a quarter. */
export const MAX_PLAYS_PER_QUARTER = 20_000;
/** An imported play this close to a logged one is the same listen. */
const SAME_PLAY_MS = 60_000;

const playsKey = (q: QuarterId) => `plays:${q}`;
const rewindKey = (q: QuarterId) => `rewind:${q}`;

export function createLog(kv: Kv) {
  // One write at a time, so two quick appends can't overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };
  const read = async (q: QuarterId) => (await kv.get<Play[]>(playsKey(q))) ?? [];
  const write = (q: QuarterId, ps: Play[]) => kv.set(playsKey(q), ps.slice(-MAX_PLAYS_PER_QUARTER));

  return {
    // shortcut: rewrites the whole quarter on each append (one write per track);
    // split into per-day keys if a quarter's log ever gets slow to save.
    append: (p: Play) =>
      serial(async () => {
        const q = quarterOf(p.startedAt);
        await write(q, [...(await read(q)), p]);
      }),

    plays: (q: QuarterId) => serial(() => read(q)),

    addImported: (q: QuarterId, ps: Play[]) =>
      serial(async () => {
        const have = await read(q);
        const byVideo = new Map<string, number[]>();
        for (const p of have) byVideo.set(p.videoId, [...(byVideo.get(p.videoId) ?? []), p.startedAt]);
        const fresh = ps.filter((p) => {
          if (quarterOf(p.startedAt) !== q) return false;
          const times = byVideo.get(p.videoId) ?? [];
          if (times.some((t) => Math.abs(t - p.startedAt) < SAME_PLAY_MS)) return false;
          byVideo.set(p.videoId, [...times, p.startedAt]);
          return true;
        });
        if (fresh.length) await write(q, [...have, ...fresh].sort((a, b) => a.startedAt - b.startedAt));
        return fresh.length;
      }),

    saveRewind: (r: Rewind) =>
      serial(async () => {
        await kv.set(rewindKey(r.quarter), r);
        await kv.del(playsKey(r.quarter));
      }),

    /** An ended quarter with too little to show: nothing to keep. */
    dropPlays: (q: QuarterId) => serial(() => kv.del(playsKey(q))),

    rewind: (q: QuarterId) => serial(() => kv.get<Rewind>(rewindKey(q))),

    rewinds: () =>
      serial(async () => {
        const ks = (await kv.keys()).filter((k) => k.startsWith("rewind:")).sort().reverse();
        return (await Promise.all(ks.map((k) => kv.get<Rewind>(k)))).filter((r): r is Rewind => !!r);
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
  set: (k, v) => (store ? quiet(set(k, v, store), undefined) : Promise.resolve()),
  del: (k) => (store ? quiet(del(k, store), undefined) : Promise.resolve()),
  keys: async () => (store ? (await quiet(keys(store), [])).map(String) : []),
});
