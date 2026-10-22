import { useEffect } from "react";
import { findAlternateVideoId } from "@/lib/innertube/alternate-source";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { useTrackSourceStore } from "@/lib/store/track-source";

// Tracks found to have no music video this session, so they aren't looked up
// again; and lookups in flight, so a track is never looked up twice at once.
const noVideo = new Set<string>();
const looking = new Set<string>();

/**
 * Bring one track's Song/Video choice in line with video mode: its music
 * video while the mode is on (its song when it has none), its song when off.
 */
export async function followVideoMode(track: QueueTrack | undefined): Promise<void> {
  if (!track) return;
  const src = useTrackSourceStore.getState();
  const rec = src.byVideoId[track.videoId];
  const want = src.videoMode ? "video" : "song";
  if ((rec?.selected ?? "song") === want) return;
  if (want === "song") return src.setSelected(track.videoId, "song");
  if (rec?.video) return src.setSelected(track.videoId, "video");
  if (noVideo.has(track.videoId) || looking.has(track.videoId)) return;
  looking.add(track.videoId);
  const alt = await findAlternateVideoId(track, "video").catch(() => null);
  looking.delete(track.videoId);
  if (!alt) {
    noVideo.add(track.videoId);
    return;
  }
  const now = useTrackSourceStore.getState();
  now.setAlternate(track.videoId, "video", alt);
  if (now.videoMode) now.setSelected(track.videoId, "video"); // the mode may have changed meanwhile
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
      const key = `${mode}|${cur?.videoId}|${next?.videoId}`;
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
