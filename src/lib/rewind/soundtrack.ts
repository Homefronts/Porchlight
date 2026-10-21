import { fisherYates, usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import type { Rewind } from "./types";

/**
 * While a rewind plays, so do its top songs (shuffled). Returns the undo:
 * your own queue or mix comes back on the same song, at the same second,
 * playing or paused as it was.
 */
export function playSoundtrack(r: Rewind): () => void {
  const tracks: QueueTrack[] = r.topSongs.map((s) => ({
    videoId: s.key,
    title: s.name,
    artists: s.by ? [{ name: s.by }] : [],
    thumbnails: s.thumb ? [{ url: s.thumb }] : [],
  }));
  if (!tracks.length) return () => {};
  const { queue, index, position, playing, radio, queueContinuation } = usePlaybackStore.getState();
  usePlaybackStore.getState().setQueue(fisherYates(tracks));

  return () => {
    const id = queue[index]?.videoId;
    if (!id) return usePlaybackStore.getState().stopPlayback();
    usePlaybackStore.setState({
      queue, index, playing, radio, queueContinuation,
      status: "loading", streamUrl: undefined, error: undefined, position: 0, duration: queue[index].duration ?? 0,
    });
    if (position < 1) return;
    // Seek once the old song has loaded again; give up if the queue moves on first.
    const off = usePlaybackStore.subscribe((s) => {
      if (s.queue[s.index]?.videoId !== id) off();
      else if (s.status === "ready") {
        off();
        s.seek(position);
      }
    });
  };
}
