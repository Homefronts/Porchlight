import { useEffect } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ShelfItem } from "@/lib/innertube/types";
import type { QueueTrack } from "@/lib/store/playback";
import { shelfItemToTrack } from "@/lib/queue-track";

// Mirrors src-tauri/src/downloads.rs (serde camelCase; Option → null).

export type CollectionKind = "playlist" | "album" | "liked";

export type DlTrack = {
  videoId: string;
  meta: QueueTrack;
  coverUrl: string | null;
  coverFile: string | null;
  state: "pending" | "done" | "failed";
  error: string | null;
  attempts: number;
  /** Unix secs before which a failed attempt isn't retried. */
  nextTry: number;
  size: number;
  /** Collection ids and/or "single". */
  refs: string[];
};

export type DlCollection = {
  id: string;
  kind: CollectionKind;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  coverFile: string | null;
  trackIds: string[];
  syncedAt: number;
  /** Account (id:pageId) a Liked Songs download belongs to. */
  owner: string | null;
};

export type DownloadsIndex = {
  version: number;
  collections: Record<string, DlCollection>;
  tracks: Record<string, DlTrack>;
};

export type TrackInput = {
  videoId: string;
  meta: QueueTrack;
  coverUrl: string | null;
};

export type CollectionInput = {
  id: string;
  kind: CollectionKind;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  owner?: string | null;
  tracks: TrackInput[];
};

export const SINGLE_REF = "single";

const EMPTY: DownloadsIndex = { version: 1, collections: {}, tracks: {} };

/** Rust owns the index; this is a read-only mirror fed by `downloads-changed`. */
export const useDownloadsStore = create<{
  index: DownloadsIndex;
  setIndex: (index: DownloadsIndex) => void;
}>()((set) => ({
  index: EMPTY,
  setIndex: (index) => set({ index }),
}));

/** Mount once in AppShell. Listener first so no change is missed. */
export function useDownloadsBridge(): void {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const setIndex = useDownloadsStore.getState().setIndex;
    void listen<DownloadsIndex>("downloads-changed", (e) =>
      setIndex(e.payload),
    ).then((un) => {
      if (cancelled) un();
      else dispose = un;
      return invoke<DownloadsIndex>("downloads_index")
        .then((idx) => {
          if (!cancelled) setIndex(idx);
        })
        .catch((e) => console.error("[downloads] index failed:", e));
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
}

export function trackDownloadState(
  index: DownloadsIndex,
  videoId: string,
): "none" | DlTrack["state"] {
  return index.tracks[videoId]?.state ?? "none";
}

export function collectionProgress(
  index: DownloadsIndex,
  id: string,
): { done: number; failed: number; total: number } | null {
  const c = index.collections[id];
  if (!c) return null;
  let done = 0;
  let failed = 0;
  for (const tid of c.trackIds) {
    const s = index.tracks[tid]?.state;
    if (s === "done") done++;
    else if (s === "failed") failed++;
  }
  return { done, failed, total: c.trackIds.length };
}

/** Covers saved with a download are served by the stream server's /cover route. */
export function downloadedCoverUrl(
  base: string,
  file?: string | null,
): string | undefined {
  return file ? `${base}/cover/${file}` : undefined;
}

export function trackToInput(t: ShelfItem | QueueTrack): TrackInput | null {
  const meta = shelfItemToTrack(t);
  if (!meta) return null;
  const widest = [...meta.thumbnails].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  )[0];
  return { videoId: meta.videoId, meta, coverUrl: widest?.url ?? null };
}

export async function downloadTrack(t: ShelfItem | QueueTrack): Promise<void> {
  const track = trackToInput(t);
  if (track) await invoke("downloads_add_track", { track });
}

export function removeTrackDownload(videoId: string): Promise<void> {
  return invoke("downloads_remove_track", { videoId });
}

export function removeCollectionDownload(id: string): Promise<void> {
  return invoke("downloads_remove_collection", { id });
}
