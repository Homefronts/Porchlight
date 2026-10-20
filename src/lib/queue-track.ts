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
 * Queue for a row click: with a `playable` filter (offline downloads),
 * only rows that pass, starting at the clicked one; null if it doesn't pass.
 */
export function rowQueue(
  tracks: ShelfItem[],
  idx: number,
  playable?: (t: ShelfItem) => boolean,
): { queue: ShelfItem[]; start: number } | null {
  if (!playable) return { queue: tracks, start: idx };
  const clicked = tracks[idx];
  if (!clicked || !playable(clicked)) return null;
  const queue = tracks.filter(playable);
  return { queue, start: queue.indexOf(clicked) };
}
