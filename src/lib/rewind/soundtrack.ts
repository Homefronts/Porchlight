import { fisherYates, snippetWindow, usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import type { Rewind } from "./types";

const FADE_MS = 1200;

let fading: ReturnType<typeof setInterval> | undefined;

// shortcut: fades move the store's volume, so quitting mid-fade (about a second)
// saves the lowered volume; move the ramp into the audio engine if that bites.
function fadeTo(volume: number): Promise<void> {
  clearInterval(fading);
  const from = usePlaybackStore.getState().volume;
  const started = Date.now();
  return new Promise((done) => {
    fading = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / FADE_MS);
      usePlaybackStore.setState({ volume: from + (volume - from) * t });
      if (t < 1) return;
      clearInterval(fading);
      done();
    }, 40);
  });
}

/** Run `fn` once the current track has loaded (skipped if another track comes first). */
function whenReady(videoId: string, fn: (duration: number) => void): () => void {
  const off = usePlaybackStore.subscribe((s) => {
    if (s.queue[s.index]?.videoId !== videoId) off();
    else if (s.status === "ready" && s.duration > 0) {
      off();
      fn(s.duration);
    }
  });
  return off;
}

/**
 * While a rewind plays, so do its top songs: shuffled snippets from the good
 * part, crossfading into each other (snippet mode in the audio engine). Returns
 * the undo: fade out, then your own queue or mix comes back on the same song,
 * at the same second, playing or paused as it was.
 */
export function playSoundtrack(r: Rewind): () => Promise<void> {
  const tracks: QueueTrack[] = r.topSongs.map((s) => ({
    videoId: s.key,
    title: s.name,
    artists: s.by ? [{ name: s.by }] : [],
    thumbnails: s.thumb ? [{ url: s.thumb }] : [],
  }));
  if (!tracks.length) return async () => {};
  const { queue, index, position, playing, radio, queueContinuation, volume } = usePlaybackStore.getState();

  usePlaybackStore.setState({ snippets: true, volume: 0 });
  usePlaybackStore.getState().setQueue(fisherYates(tracks));
  // The first song starts at its snippet; later ones arrive there by crossfade.
  let offFirst = whenReady(usePlaybackStore.getState().queue[0].videoId, (d) => {
    usePlaybackStore.getState().seek(snippetWindow(d)[0]);
    void fadeTo(volume);
  });

  return async () => {
    offFirst();
    offFirst = () => {};
    await fadeTo(0);
    usePlaybackStore.setState({ snippets: false });
    const id = queue[index]?.videoId;
    if (!id) {
      usePlaybackStore.getState().stopPlayback();
      usePlaybackStore.setState({ volume });
      return;
    }
    usePlaybackStore.setState({
      queue, index, playing, radio, queueContinuation,
      status: "loading", streamUrl: undefined, error: undefined, position: 0, duration: queue[index].duration ?? 0,
    });
    if (position >= 1) whenReady(id, () => usePlaybackStore.getState().seek(position));
    await fadeTo(volume);
  };
}
