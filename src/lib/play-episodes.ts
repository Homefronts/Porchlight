import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";

/** Play episodes in the given order from `startIndex`; shuffle goes off first or setQueue would shuffle them. */
export function playEpisodes(tracks: QueueTrack[], startIndex: number) {
  const s = usePlaybackStore.getState();
  s.setShuffle(false);
  s.setQueue(tracks, startIndex);
}
