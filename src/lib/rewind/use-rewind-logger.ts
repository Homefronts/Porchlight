import { useEffect } from "react";
import { usePlaybackStore, type PlaybackState, type QueueTrack } from "@/lib/store/playback";
import { useSettingsStore } from "@/lib/store/settings";
import { rewindLog } from "./log";
import { PlayTimer, type TimedPlay } from "./timing";
import type { Play } from "./types";

/** A jump back to the start after this much is a replay (repeat-one). */
const REPLAY_AFTER_SEC = 30;
/** How often the play in progress is saved, so a hard quit loses at most this much. */
const PENDING_EVERY_MS = 15_000;
// Quit is an instant exit from Rust: no time for an async IndexedDB write,
// so the play in progress is kept in localStorage (sync, tiny) as it goes.
export const PENDING_KEY = "ytubic-rewind-pending";

function toPlay(t: TimedPlay, track: QueueTrack): Play {
  return {
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
  };
}

const forget = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked: nothing to forget */
  }
};

/** Log the play a hard quit cut off last session. Called once at startup. */
export async function recoverPendingPlay(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
  } catch {
    return;
  }
  forget();
  if (!raw) return;
  try {
    const p = JSON.parse(raw) as Play;
    if (p.videoId && p.playedSec > 0) await rewindLog.append(p);
  } catch {
    /* corrupt: dropped */
  }
}

/**
 * Logs plays for Rewind, on this computer only. No timer: listening time is
 * the gap between play and pause timestamps, and the log is written once per
 * track (on change or app close). Store subscriptions, so nothing re-renders.
 * Mounted once in AppShell.
 */
export function useRewindLogger(): void {
  useEffect(() => {
    void recoverPendingPlay();
    const timer = new PlayTimer();
    let track: QueueTrack | undefined;
    let duration = 0;
    let since: number | null = null; // really playing since, ms
    let lastPos = 0;
    let savedAt = 0;

    const pause = () => {
      if (since !== null) timer.tick(Date.now() - since);
      since = null;
    };
    const resume = () => {
      if (since !== null || !track) return;
      since = Date.now();
      timer.markPlaying(since);
    };
    const flush = () => {
      pause();
      const t = timer.finish(duration || track?.duration);
      forget();
      if (t && track && t.playedSec > 0) void rewindLog.append(toPlay(t, track));
    };
    const savePending = () => {
      const t = track && timer.peek(duration || track.duration, since === null ? 0 : Date.now() - since);
      if (!t || !track || t.playedSec <= 0) return;
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(toPlay(t, track)));
      } catch {
        /* storage full or blocked: the normal flush still logs it */
      }
    };
    const begin = (t: QueueTrack | undefined, s: PlaybackState) => {
      track = t;
      duration = 0;
      since = null;
      savedAt = Date.now();
      if (t) timer.start(t.videoId, Date.now());
      if (t && s.playing && s.status === "ready") resume();
    };

    const sync = (s: PlaybackState) => {
      const on = useSettingsStore.getState().rewindHistory;
      // The Rewind's own soundtrack (snippet mode) isn't listening: like no track at
      // all, so the play before it is logged as it ends, and nothing during it.
      const cur = on && !s.snippets && s.index >= 0 ? s.queue[s.index] : undefined;
      // Loading or buffering isn't listening.
      const audible = s.playing && s.status === "ready";
      if (cur?.videoId !== track?.videoId) {
        if (on) flush();
        else {
          timer.finish(); // history switched off: drop the play in progress
          forget();
        }
        begin(cur, s);
      } else if (cur && lastPos > REPLAY_AFTER_SEC && s.position < 1) {
        flush();
        begin(cur, s);
      } else if (cur && audible) {
        resume();
      } else {
        pause();
      }
      if (cur && s.duration > 0) duration = s.duration;
      lastPos = s.position;
      if (cur && since !== null && Date.now() - savedAt >= PENDING_EVERY_MS) {
        savedAt = Date.now();
        savePending();
      }
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
