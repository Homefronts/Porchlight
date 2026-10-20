import type { ShelfItem } from "@/lib/innertube/types";
import type { QueueTrack } from "@/lib/store/playback";

/** Playable shelf rows (songs, videos) as queue tracks; anything else → null. */
export function shelfItemToTrack(item: ShelfItem | QueueTrack): QueueTrack | null {
  if ("videoId" in item) return item;
  if (item.kind !== "song" && item.kind !== "video") return null;
  return {
    videoId: item.id,
    title: item.title,
    subtitle: item.subtitle,
    artists: item.artists,
    album: item.album,
    albumId: item.albumId,
    thumbnails: item.thumbnails,
    duration: item.duration,
  };
}

/**
 * Queue for a row click. With `toQueue` (offline downloads), each row maps
 * to the item to queue, or null when it can't play; only playable rows are
 * queued, starting at the clicked one, and a click on an unplayable row is
 * refused (null).
 */
export function rowQueue(
  tracks: ShelfItem[],
  idx: number,
  toQueue?: (t: ShelfItem) => ShelfItem | null,
): { queue: ShelfItem[]; start: number } | null {
  if (!toQueue) return { queue: tracks, start: idx };
  if (!tracks[idx] || !toQueue(tracks[idx])) return null;
  const queue: ShelfItem[] = [];
  let start = 0;
  tracks.forEach((t, i) => {
    const q = toQueue(t);
    if (!q) return;
    if (i === idx) start = queue.length;
    queue.push(q);
  });
  return { queue, start };
}
