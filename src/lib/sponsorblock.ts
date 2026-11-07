import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Segment = { start: number; end: number; uuid: string };

/** Don't skip this close to the end of a segment, so a seek can't loop at the boundary. */
const END_MARGIN = 0.5;

/** Segments kept for downloaded episodes so skipping works offline. */
export const useSponsorCache = create<{ byId: Record<string, Segment[]> }>()(
  persist(() => ({ byId: {} }), { name: "ytm-sponsor-cache" }),
);

const cache = new Map<string, Promise<Segment[] | null>>();

/** The video's segments; null when the lookup failed (as opposed to "none"). */
async function load(videoId: string): Promise<Segment[] | null> {
  try {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(videoId));
    const prefix = [...new Uint8Array(hash)]
      .slice(0, 2)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const res = await tauriFetch(
      `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent('["sponsor"]')}`,
    );
    // 404 is SponsorBlock's "no segments for this prefix".
    if (res.status === 404) return [];
    if (!res.ok) return null;
    const rows = (await res.json()) as { videoID: string; segments: { segment: [number, number]; UUID: string }[] }[];
    const row = rows.find((r) => r.videoID === videoId);
    return (row?.segments ?? []).map((s) => ({ start: s.segment[0], end: s.segment[1], uuid: s.UUID }));
  } catch {
    return null;
  }
}

function lookup(videoId: string): Promise<Segment[] | null> {
  let p = cache.get(videoId);
  if (!p) cache.set(videoId, (p = load(videoId)));
  return p;
}

/** Sponsor segments for a video; any failure is `[]`. Cached for the session, failures too. */
export async function fetchSponsorSegments(videoId: string): Promise<Segment[]> {
  return useSponsorCache.getState().byId[videoId] ?? (await lookup(videoId)) ?? [];
}

let lastSync: string | undefined;
let syncing: Promise<void> = Promise.resolve();

/**
 * Keep segments for exactly these downloaded episodes: fetch the missing, drop the removed.
 * Runs on every downloads-changed event, so an unchanged set is a no-op and syncs queue up
 * one at a time. A failed lookup stays failed for the session (no offline retry loop).
 */
export function syncSponsorCache(ids: string[]): Promise<void> {
  const key = [...ids].sort().join(",");
  if (key === lastSync) return syncing;
  lastSync = key;
  return (syncing = syncing.then(async () => {
    const want = new Set(ids);
    const { byId } = useSponsorCache.getState();
    const kept = Object.fromEntries(Object.entries(byId).filter(([id]) => want.has(id)));
    if (Object.keys(kept).length !== Object.keys(byId).length) useSponsorCache.setState({ byId: kept }, true);
    for (const id of want) {
      if (kept[id]) continue;
      const segs = await lookup(id);
      if (segs) useSponsorCache.setState((s) => ({ byId: { ...s.byId, [id]: segs } }));
    }
  }));
}

export function segmentToSkip(position: number, segments: Segment[], undone: Set<string>): Segment | null {
  return (
    segments.find((s) => !undone.has(s.uuid) && position >= s.start && position < s.end - END_MARGIN) ?? null
  );
}
