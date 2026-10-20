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
