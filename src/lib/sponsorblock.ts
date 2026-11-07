import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type Segment = { start: number; end: number; uuid: string };

/** Don't skip this close to the end of a segment, so a seek can't loop at the boundary. */
const END_MARGIN = 0.5;

const cache = new Map<string, Promise<Segment[]>>();

async function load(videoId: string): Promise<Segment[]> {
  try {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(videoId));
    const prefix = [...new Uint8Array(hash)]
      .slice(0, 2)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const res = await tauriFetch(
      `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent('["sponsor"]')}`,
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { videoID: string; segments: { segment: [number, number]; UUID: string }[] }[];
    const row = rows.find((r) => r.videoID === videoId);
    return (row?.segments ?? []).map((s) => ({ start: s.segment[0], end: s.segment[1], uuid: s.UUID }));
  } catch {
    return [];
  }
}

/** Sponsor segments for a video; any failure is `[]`. Cached for the session, failures too. */
export function fetchSponsorSegments(videoId: string): Promise<Segment[]> {
  let p = cache.get(videoId);
  if (!p) cache.set(videoId, (p = load(videoId)));
  return p;
}

export function segmentToSkip(position: number, segments: Segment[], undone: Set<string>): Segment | null {
  return (
    segments.find((s) => !undone.has(s.uuid) && position >= s.start && position < s.end - END_MARGIN) ?? null
  );
}
