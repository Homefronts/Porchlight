import { useEffect } from "react";
import { usePlaybackStore, type PlaybackState, type QueueTrack } from "@/lib/store/playback";
import { useSettingsStore } from "@/lib/store/settings";
import { rewindLog } from "./log";
import { PlayTimer } from "./timing";

/** A jump back to the start after this much is a replay (repeat-one). */
const REPLAY_AFTER_SEC = 30;

/**
 * Logs plays for Rewind, on this computer only. No timer: listening time is
 * the gap between play and pause timestamps, and the log is written once per
 * track (on change or app close). Store subscriptions, so nothing re-renders.
 * Mounted once in AppShell.
 */
export function useRewindLogger(): void {
  useEffect(() => {
    const timer = new PlayTimer();
    let track: QueueTrack | undefined;
    let duration = 0;
    let since: number | null = null; // playing since, ms
    let lastPos = 0;

    const pause = () => {
      if (since !== null) timer.tick(Date.now() - since);
      since = null;
    };
    const flush = () => {
      pause();
      const t = timer.finish(duration || track?.duration);
      if (!t || !track || t.playedSec <= 0) return;
      void rewindLog.append({
        videoId: t.videoId,
        title: track.title,
        artists: track.artists ?? [],
        album: track.album,
        albumId: track.albumId,
        thumb: track.thumbnails[track.thumbnails.length - 1]?.url,
        startedAt: t.startedAt,
        playedSec: t.playedSec,
        counted: t.counted,
        aiAllowed: track.aiAllowed,
        source: "app",
      });
    };
    const begin = (t: QueueTrack | undefined, playing: boolean) => {
      track = t;
      duration = 0;
      if (t) timer.start(t.videoId, Date.now());
      since = t && playing ? Date.now() : null;
    };

    const sync = (s: PlaybackState) => {
      const cur = useSettingsStore.getState().rewindHistory && s.index >= 0 ? s.queue[s.index] : undefined;
      if (cur?.videoId !== track?.videoId) {
        if (cur || useSettingsStore.getState().rewindHistory) flush();
        else timer.finish(); // history switched off: drop the play in progress
        begin(cur, s.playing);
      } else if (cur && lastPos > REPLAY_AFTER_SEC && s.position < 1) {
        flush();
        begin(cur, s.playing);
      } else if (s.playing && since === null && cur) {
        since = Date.now();
      } else if (!s.playing) {
        pause();
      }
      if (cur && s.duration > 0) duration = s.duration;
      lastPos = s.position;
    };

    sync(usePlaybackStore.getState());
    const offPlayback = usePlaybackStore.subscribe(sync);
    const offSettings = useSettingsStore.subscribe(() => sync(usePlaybackStore.getState()));
    window.addEventListener("pagehide", flush);
    return () => {
      offPlayback();
      offSettings();
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
}
