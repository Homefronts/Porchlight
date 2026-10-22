import { fisherYates, snippetWindow, usePlaybackStore, type QueueTrack, type SnippetResume } from "@/lib/store/playback";
import type { Rewind } from "./types";

const FADE_MS = 1200;

let fading: ReturnType<typeof setInterval> | undefined;
// Settles the fade in progress; a newer fade settles it early instead of
// leaving whoever awaits it hanging (that stranded the queue hand-back).
let settle: (() => void) | undefined;

// shortcut: fades move the store's volume, so quitting during the fade back in
// after a Rewind (about a second) saves the lowered volume; move the ramp into
// the audio engine if that bites. During the Rewind itself, your own volume is
// what gets saved (snippetResume).
function fadeTo(volume: number): Promise<void> {
  clearInterval(fading);
  settle?.();
  const from = usePlaybackStore.getState().volume;
  const started = Date.now();
  return new Promise((done) => {
    settle = done;
    fading = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / FADE_MS);
      usePlaybackStore.setState({ volume: from + (volume - from) * t });
      if (t < 1) return;
      clearInterval(fading);
      settle = undefined;
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

// Bumped by every soundtrack; a hand-back that finds a newer one leaves it the queue.
let generation = 0;

/**
 * While a rewind plays, so do its top songs: shuffled snippets from the good
 * part, crossfading into each other (snippet mode in the audio engine). Returns
 * the undo: fade out, then your own queue or mix comes back on the same song,
 * at the same second, playing or paused as it was.
 *
 * Your queue waits in the store (`snippetResume`), so it is what gets saved if
 * the app quits mid-Rewind, and a Rewind reopened while the last one is still
 * handing back keeps it rather than saving the first soundtrack as "yours".
 */
export function playSoundtrack(r: Rewind): () => Promise<void> {
  const tracks: QueueTrack[] = r.topSongs.map((s) => ({
    videoId: s.key,
    title: s.name,
    artists: s.by ? [{ name: s.by }] : [],
    thumbnails: s.thumb ? [{ url: s.thumb }] : [],
  }));
  if (!tracks.length) return async () => {};
  const st = usePlaybackStore.getState();
  const resume: SnippetResume = st.snippetResume ?? {
    queue: st.queue,
    index: st.index,
    position: st.position,
    playing: st.playing,
    radio: st.radio,
    queueContinuation: st.queueContinuation,
    volume: st.volume,
  };
  const mine = ++generation;

  usePlaybackStore.setState({ snippets: true, snippetResume: resume, volume: 0 });
  usePlaybackStore.getState().setQueue(fisherYates(tracks));
  // The first song starts at its snippet; later ones arrive there by crossfade.
  let offFirst = whenReady(usePlaybackStore.getState().queue[0].videoId, (d) => {
    usePlaybackStore.getState().seek(snippetWindow(d)[0]);
    void fadeTo(resume.volume);
  });

  return async () => {
    offFirst();
    offFirst = () => {};
    await fadeTo(0);
    if (mine !== generation) return; // a newer Rewind is playing; it hands the queue back
    const { queue, index, position, playing, radio, queueContinuation, volume } = resume;
    const id = queue[index]?.videoId;
    if (!id) {
      usePlaybackStore.setState({ snippets: false, snippetResume: undefined });
      usePlaybackStore.getState().stopPlayback();
      usePlaybackStore.setState({ volume });
      return;
    }
    const now = usePlaybackStore.getState();
    // Snippet mode ends with your queue in the same update, so video mode
    // re-applies to your track and never to a Rewind song (see video-mode.ts).
    const back = { snippets: false, snippetResume: undefined, queue, index, playing, radio, queueContinuation };
    if (now.queue[now.index]?.videoId === id && now.index === index) {
      // The same song at the same spot: the engine won't reload it, so marking it
      // "loading" would stick. It's already playing; just go back to your place.
      usePlaybackStore.setState(back);
      usePlaybackStore.getState().seek(position);
    } else {
      usePlaybackStore.setState({ ...back, status: "loading", streamUrl: undefined, error: undefined, position: 0, duration: queue[index].duration ?? 0 });
      if (position >= 1) whenReady(id, () => usePlaybackStore.getState().seek(position));
    }
    await fadeTo(volume);
  };
}
