// Same bar as the Last.fm scrobbler (src/lib/lastfm-scrobbler.ts).
const CAP_SECONDS = 240;
const MIN_TRACK_SECONDS = 30;

/** Half the track or 4 minutes, whichever comes first; never under 30 s. */
export function countsAsPlay(playedSec: number, durationSec: number | undefined): boolean {
  const dur = durationSec && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (dur > 0 && dur < MIN_TRACK_SECONDS) return false;
  return playedSec >= (dur > 0 ? Math.min(dur / 2, CAP_SECONDS) : CAP_SECONDS);
}

export type TimedPlay = { videoId: string; startedAt: number; playedSec: number; counted: boolean };

/** Accrues real listening time for one play at a time. */
export class PlayTimer {
  private cur: { videoId: string; startedAt: number; ms: number; playing: boolean } | null = null;

  start(videoId: string, now: number): void {
    this.cur = { videoId, startedAt: now, ms: 0, playing: false };
  }

  /** The play is dated from its first real playback, not from being queued. */
  markPlaying(now: number): void {
    if (this.cur && !this.cur.playing) Object.assign(this.cur, { playing: true, startedAt: now });
  }

  tick(ms: number): void {
    if (this.cur) this.cur.ms += ms;
  }

  get videoId(): string | undefined {
    return this.cur?.videoId;
  }

  /** The current play so far (plus `extraMs` still running), without ending it. */
  peek(durationSec?: number, extraMs = 0): TimedPlay | null {
    const c = this.cur;
    if (!c) return null;
    let playedSec = Math.round((c.ms + extraMs) / 1000);
    // Anything past the song's length is a stall or a sleep, not listening.
    if (durationSec && durationSec > 0) playedSec = Math.min(playedSec, Math.ceil(durationSec));
    return { videoId: c.videoId, startedAt: c.startedAt, playedSec, counted: countsAsPlay(playedSec, durationSec) };
  }

  /** Ends the current play; null when none is running. */
  finish(durationSec?: number): TimedPlay | null {
    const t = this.peek(durationSec);
    this.cur = null;
    return t;
  }
}
