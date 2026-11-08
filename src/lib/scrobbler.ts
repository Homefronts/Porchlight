import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isEpisode, usePlaybackStore } from "@/lib/store/playback";
import { useSettingsStore } from "@/lib/store/settings";
import { lastfmArtist } from "@/lib/lastfm";

/**
 * Scrobbling timing for Last.fm, Libre.fm and ListenBrainz. The network calls
 * and the offline retry queues live in Rust (`src-tauri/src/lastfm.rs` covers
 * Last.fm and Libre.fm, `listenbrainz.rs` covers ListenBrainz); this hook owns
 * the *when*, shared by every service:
 *
 *   * on a track change it announces "now playing", and
 *   * it accrues real listening time (paused time doesn't count) and fires a
 *     scrobble the moment a track crosses the usual bar: played for at least
 *     half its length or 4 minutes, whichever comes first, and never for
 *     tracks shorter than 30 seconds.
 *
 * Mounted once in AppShell next to the other playback-reactive hooks. Reads
 * track metadata imperatively (like the audio engine) so a late title/artwork
 * refresh can't re-fire the effects and reset the accrued play time.
 *
 * Known v1 limitation: a track repeated back-to-back (repeat-one) keeps the
 * same queue slot, so the replay isn't scrobbled again, only the first play.
 */

// Scrobble at 50% of the track or this many seconds, whichever is sooner.
const SCROBBLE_CAP_SECONDS = 240;
// Last.fm ignores tracks shorter than this.
const MIN_TRACK_SECONDS = 30;

type AccountSettings = {
  lastfmEnabled: boolean;
  lastfmSessionKey: string | null;
  lastfmLoveSync: boolean;
  librefmEnabled: boolean;
  librefmSessionKey: string | null;
  librefmLoveSync: boolean;
  listenbrainzEnabled: boolean;
  listenbrainzToken: string | null;
};

export type ScrobbleTarget = {
  id: "lastfm" | "librefm" | "listenbrainz";
  nowPlaying: string;
  scrobble: string;
  flush: string;
  /** Extra args identifying the account, sent with every call. */
  auth: Record<string, string>;
};

/** Every service that is connected and switched on, in a fixed order. */
export function scrobbleTargets(s: AccountSettings): ScrobbleTarget[] {
  const out: ScrobbleTarget[] = [];
  for (const service of ["lastfm", "librefm"] as const) {
    const on = service === "lastfm" ? s.lastfmEnabled : s.librefmEnabled;
    const key = service === "lastfm" ? s.lastfmSessionKey : s.librefmSessionKey;
    if (on && key)
      out.push({
        id: service,
        nowPlaying: "lastfm_update_now_playing",
        scrobble: "lastfm_scrobble",
        flush: "lastfm_flush",
        auth: { service, sessionKey: key },
      });
  }
  if (s.listenbrainzEnabled && s.listenbrainzToken)
    out.push({
      id: "listenbrainz",
      nowPlaying: "listenbrainz_now_playing",
      scrobble: "listenbrainz_scrobble",
      flush: "listenbrainz_flush",
      auth: { token: s.listenbrainzToken },
    });
  return out;
}

/** Where a like is mirrored as a love: Last.fm and Libre.fm, each opt-in. */
export function loveTargets(
  s: AccountSettings,
): { service: "lastfm" | "librefm"; sessionKey: string }[] {
  const out: { service: "lastfm" | "librefm"; sessionKey: string }[] = [];
  if (s.lastfmLoveSync && s.lastfmSessionKey)
    out.push({ service: "lastfm", sessionKey: s.lastfmSessionKey });
  if (s.librefmLoveSync && s.librefmSessionKey)
    out.push({ service: "librefm", sessionKey: s.librefmSessionKey });
  return out;
}

type TrackTiming = {
  videoId: string;
  /** Unix seconds when the track started. Scrobbles are timestamped with the
   *  start time, not the moment the threshold is crossed. */
  startedAt: number;
  /** Accrued real listening time. */
  playedMs: number;
  scrobbled: boolean;
};

function durationSeconds(d: number): number {
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export function useScrobbler(): void {
  // A string, so the effects only re-run when the set of accounts changes.
  const accounts = useSettingsStore((s) =>
    scrobbleTargets(s)
      .map((t) => t.id + JSON.stringify(t.auth))
      .join("|"),
  );
  const active = accounts !== "";

  const videoId = usePlaybackStore((s) =>
    s.index >= 0 ? s.queue[s.index]?.videoId : undefined,
  );
  const playing = usePlaybackStore((s) => s.playing);

  const timingRef = useRef<TrackTiming | null>(null);

  // New track (or the accounts changed): reset the play-time counter and
  // announce "now playing". Duration is omitted here: the real value isn't
  // loaded yet at track start, and a wrong one is worse than none.
  useEffect(() => {
    if (!active || !videoId) {
      timingRef.current = null;
      return;
    }
    const s = usePlaybackStore.getState();
    const t = s.index >= 0 ? s.queue[s.index] : undefined;
    // Episodes aren't music: no now playing, no scrobble.
    if (!t || isEpisode(t)) {
      timingRef.current = null;
      return;
    }
    timingRef.current = {
      videoId,
      startedAt: Math.floor(Date.now() / 1000),
      playedMs: 0,
      scrobbled: false,
    };
    for (const target of scrobbleTargets(useSettingsStore.getState())) {
      void invoke(target.nowPlaying, {
        artist: lastfmArtist(t),
        track: t.title,
        album: t.album ?? "",
        duration: null,
        ...target.auth,
      }).catch(() => {
        /* best-effort; now playing is ephemeral */
      });
    }
  }, [videoId, active, accounts]);

  // While playing, accrue a second at a time and scrobble once the threshold is
  // crossed. Pausing tears the interval down (deps include `playing`), so the
  // counter reflects actual listening rather than wall-clock.
  useEffect(() => {
    if (!active || !playing) return;
    const id = window.setInterval(() => {
      const timing = timingRef.current;
      if (!timing || timing.scrobbled) return;

      const s = usePlaybackStore.getState();
      const t = s.index >= 0 ? s.queue[s.index] : undefined;
      // Only count toward the track this timing belongs to.
      if (!t || t.videoId !== timing.videoId) return;

      timing.playedMs += 1000;

      const dur = durationSeconds(s.duration);
      if (dur > 0 && dur < MIN_TRACK_SECONDS) return; // too short to scrobble
      const thresholdSec =
        dur > 0 ? Math.min(dur / 2, SCROBBLE_CAP_SECONDS) : SCROBBLE_CAP_SECONDS;
      if (timing.playedMs / 1000 < thresholdSec) return;

      const targets = scrobbleTargets(useSettingsStore.getState());
      if (targets.length === 0) return;
      timing.scrobbled = true;
      for (const target of targets) {
        void invoke(target.scrobble, {
          artist: lastfmArtist(t),
          track: t.title,
          album: t.album ?? "",
          duration: dur > 0 ? Math.round(dur) : null,
          timestamp: timing.startedAt,
          ...target.auth,
        }).catch(() => {
          /* transport failures are queued for retry on the Rust side */
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, playing]);

  // Drain scrobbles stranded offline. Rust also flushes once at startup; this
  // additionally covers connecting a service mid-session.
  useEffect(() => {
    for (const target of scrobbleTargets(useSettingsStore.getState())) {
      const args = "service" in target.auth ? { service: target.auth.service } : {};
      void invoke(target.flush, args).catch(() => {});
    }
  }, [accounts]);
}
