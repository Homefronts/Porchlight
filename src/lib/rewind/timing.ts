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
  private cur: { videoId: string; startedAt: number; ms: number } | null = null;

  start(videoId: string, now: number): void {
    this.cur = { videoId, startedAt: now, ms: 0 };
  }

  tick(ms: number): void {
    if (this.cur) this.cur.ms += ms;
  }

  get videoId(): string | undefined {
    return this.cur?.videoId;
  }

  /** Ends the current play; null when none is running. */
  finish(durationSec?: number): TimedPlay | null {
    const c = this.cur;
    if (!c) return null;
    this.cur = null;
    const playedSec = Math.round(c.ms / 1000);
    return { videoId: c.videoId, startedAt: c.startedAt, playedSec, counted: countsAsPlay(playedSec, durationSec) };
  }
}
