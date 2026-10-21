import { useEffect, useState } from "react";
import type { ShelfItem, Thumbnail } from "@/lib/innertube/types";
import { getStreamBaseUrl } from "@/lib/stream";
import {
  downloadedCoverUrl,
  useDownloadsStore,
  type DlCollection,
  type DlTrack,
} from "@/lib/downloads";

/** Stream-server base URL, for covers saved with downloads. */
export function useCoverBase(): string | undefined {
  const [base, setBase] = useState<string>();
  useEffect(() => {
    void getStreamBaseUrl().then(setBase, () => undefined);
  }, []);
  return base;
}

/** Local copy first (works offline), then the remote URL. */
function coverThumbs(
  base: string | undefined,
  file: string | null,
  url: string | null,
): Thumbnail[] {
  const local = base ? downloadedCoverUrl(base, file) : undefined;
  if (local) return [{ url: local, width: 544, height: 544 }];
  return url ? [{ url }] : [];
}

export function collectionThumbs(c: DlCollection, base?: string): Thumbnail[] {
  return coverThumbs(base, c.coverFile, c.coverUrl);
}

export function dlTrackToShelfItem(t: DlTrack, base?: string): ShelfItem {
  const local = coverThumbs(base, t.coverFile, null);
  return {
    kind: "song",
    id: t.videoId,
    title: t.meta.title,
    subtitle: t.meta.subtitle,
    artists: t.meta.artists,
    album: t.meta.album,
    albumId: t.meta.albumId,
    duration: t.meta.duration,
    thumbnails: local.length ? local : t.meta.thumbnails,
  };
}

/**
 * What offline views queue for a row: null unless it's on disk, and with
 * the track's real artwork instead of the per-launch localhost cover (the
 * queue is persisted and handed to Discord / OS media controls). Module
 * level so TrackRow's memo sees a stable prop.
 */
export function toDownloadedQueueItem(t: ShelfItem): ShelfItem | null {
  const dl = useDownloadsStore.getState().index.tracks[t.id];
  if (dl?.state !== "done") return null;
  return { ...t, thumbnails: dl.meta.thumbnails };
}
