import { useEffect, useState } from "react";
import { toast } from "sonner";
import { findAlternateVideoId } from "@/lib/innertube/alternate-source";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { useTrackSourceStore, type SourceKind } from "@/lib/store/track-source";

// Lookups by "kind:videoId": a running one is shared by everyone who asks, and
// a clean "none" stays for the session so it isn't asked again. An error is
// dropped, so the next ask tries again; a found id is dropped too (the store
// keeps it).
const lookups = new Map<string, Promise<string | null>>();

/** The other version of `track` (its video, or its song), one lookup at a time. */
export function lookupAlternate(track: QueueTrack, kind: SourceKind): Promise<string | null> {
  const key = `${kind}:${track.videoId}`;
  let p = lookups.get(key);
  if (!p) {
    p = findAlternateVideoId(track, kind);
    lookups.set(key, p);
    p.then((id) => id && lookups.delete(key), () => lookups.delete(key));
  }
  return p;
}

/**
 * Bring one track's Song/Video choice in line with video mode: its music
 * video while the mode is on (its song when it has none), its song when off.
 */
export async function followVideoMode(track: QueueTrack | undefined): Promise<void> {
  if (!track) return;
  const src = useTrackSourceStore.getState();
  const rec = src.byVideoId[track.videoId];
  // A Rewind's soundtrack (snippet mode) plays songs, whatever the saved mode.
  const want = src.videoMode && !usePlaybackStore.getState().snippets ? "video" : "song";
  if ((rec?.selected ?? "song") === want) return;
  if (want === "song") return src.setSelected(track.videoId, "song");
  if (rec?.video) return src.setSelected(track.videoId, "video");
  const alt = await lookupAlternate(track, "video").catch(() => null);
  if (!alt) return;
  const now = useTrackSourceStore.getState();
  now.setAlternate(track.videoId, "video", alt);
  // The mode (or a Rewind opening) may have changed meanwhile.
  if (now.videoMode && !usePlaybackStore.getState().snippets) now.setSelected(track.videoId, "video");
}

/**
 * Mount once in AppShell (main window): keeps the playing track, and the one
 * after it so it starts as video rather than switching mid-play, in step with
 * video mode.
 */
export function useVideoModeFollower(): void {
  useEffect(() => {
    let last = "";
    const run = () => {
      const s = usePlaybackStore.getState();
      const mode = useTrackSourceStore.getState().videoMode;
      const cur = s.queue[s.index];
      const next = s.queue[s.index + 1];
      const key = `${mode}|${s.snippets}|${cur?.videoId}|${next?.videoId}`;
      if (key === last) return;
      last = key;
      void followVideoMode(cur).then(() => followVideoMode(next));
    };
    run();
    const offPlayback = usePlaybackStore.subscribe(run);
    const offSource = useTrackSourceStore.subscribe(run);
    return () => {
      offPlayback();
      offSource();
    };
  }, []);
}

/**
 * The Song/Video switch, shared by the player chip and the ⋯ menu. The choice
 * is a mode: Video sticks for the next tracks even if this one has none, and
 * Song turns it off even on a track already playing its song. `busy` is the
 * side whose version is still being looked up.
 */
export function useSourceSwitch(track: QueueTrack) {
  const record = useTrackSourceStore((s) => s.byVideoId[track.videoId]);
  const [busy, setBusy] = useState<SourceKind | null>(null);
  const selected: SourceKind = record?.selected ?? "song";

  const switchTo = async (target: SourceKind) => {
    const src = useTrackSourceStore.getState();
    src.setVideoMode(target === "video");
    if (busy || target === selected) return;
    const cached = target === "video" ? record?.video : record?.song;
    if (cached) return src.setSelected(track.videoId, target);
    setBusy(target);
    try {
      const alt = await lookupAlternate(track, target);
      if (!alt) {
        toast.error(target === "video" ? "No video version found" : "No song version found");
        return;
      }
      const now = useTrackSourceStore.getState();
      now.setAlternate(track.videoId, target, alt);
      now.setSelected(track.videoId, target);
    } catch (e) {
      toast.error(`Couldn't switch source: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return { selected, busy, switchTo };
}
