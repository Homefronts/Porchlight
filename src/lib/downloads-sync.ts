import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetchPlaylist } from "@/lib/innertube/playlist";
import { fetchAlbum } from "@/lib/innertube/album";
import type { Thumbnail } from "@/lib/innertube/types";
import {
  trackToInput,
  useDownloadsStore,
  type CollectionInput,
  type CollectionKind,
  type TrackInput,
} from "@/lib/downloads";

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const LIKED_ID = "LM";

function widest(thumbs: Thumbnail[]): string | null {
  return (
    [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null
  );
}

/**
 * The full, current track list of a collection, ready for Rust. Throws on
 * any fetch failure or an empty list: sync treats a throw as "change
 * nothing", so a flaky continuation can never wipe a download.
 */
export async function fetchCollectionInput(
  kind: CollectionKind,
  id: string,
): Promise<CollectionInput> {
  let input: CollectionInput;
  if (kind === "album") {
    const a = await fetchAlbum(id);
    const cover = widest(a.thumbnails);
    // Album rows carry no artwork of their own; give them the album's so
    // offline views have a cover.
    const tracks = a.tracks.flatMap((t): TrackInput[] => {
      const input = trackToInput({
        ...t,
        thumbnails: t.thumbnails.length ? t.thumbnails : a.thumbnails,
        album: t.album ?? a.title,
        albumId: t.albumId ?? a.id,
      });
      return input ? [input] : [];
    });
    input = {
      id,
      kind,
      title: a.title,
      subtitle: a.artists.map((x) => x.name).join(", ") || null,
      coverUrl: cover,
      tracks,
    };
  } else {
    const p = await fetchPlaylist(kind === "liked" ? LIKED_ID : id, {
      strict: true,
    });
    input = {
      id: kind === "liked" ? LIKED_ID : id,
      kind,
      title: kind === "liked" ? "Liked Songs" : p.title,
      subtitle: p.owner ?? null,
      coverUrl: widest(p.thumbnails),
      tracks: p.tracks.flatMap((t) => trackToInput(t) ?? []),
    };
  }
  if (input.tracks.length === 0) {
    throw new Error(`no downloadable tracks in ${kind} ${id}`);
  }
  return input;
}

export async function downloadCollection(
  kind: CollectionKind,
  id: string,
): Promise<void> {
  const input = await fetchCollectionInput(kind, id);
  await invoke("downloads_set_collection", { input });
}

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Re-sync one downloaded collection. Never throws; failure leaves it as is. */
export async function syncCollection(id: string): Promise<void> {
  const c = useDownloadsStore.getState().index.collections[id];
  if (!c || offline()) return;
  try {
    await downloadCollection(c.kind, c.id);
  } catch (e) {
    console.warn(`[downloads] sync skipped for ${id}:`, e);
  }
}

async function syncAll(): Promise<void> {
  for (const id of Object.keys(useDownloadsStore.getState().index.collections)) {
    await syncCollection(id);
  }
}

/**
 * Mount once in AppShell: sync every downloaded collection at launch,
 * every 6 h, and when the connection comes back.
 */
export function useDownloadsSync(): void {
  useEffect(() => {
    // The index arrives asynchronously from Rust; wait for the first
    // non-empty snapshot before the launch sync.
    let launched = false;
    const launch = () => {
      if (launched) return;
      if (Object.keys(useDownloadsStore.getState().index.collections).length) {
        launched = true;
        void syncAll();
      }
    };
    const unsub = useDownloadsStore.subscribe(launch);
    launch();
    const timer = window.setInterval(() => void syncAll(), SYNC_INTERVAL_MS);
    const onOnline = () => void syncAll();
    window.addEventListener("online", onOnline);
    return () => {
      unsub();
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
