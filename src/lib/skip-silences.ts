import { subscribeAnalysis } from "@/lib/native-media";

/** Below this level (about -48 dB) a stretch counts as silence. */
const QUIET = 0.004;
/** Sound comes back above this. A little higher, so a fade-out doesn't flicker. */
const LOUD = 0.01;
/** How long it has to stay quiet before it's skipped, so short pauses in a song stay. */
const QUIET_MS = 1500;
/** How fast a silence plays out. The audio is silent anyway, so nothing sounds sped up. */
export const SKIP_RATE = 4;
const TICK_MS = 150;

/** The slice of the playing element this reads and drives. */
type Playable = { paused: boolean; currentTime: number; playbackRate: number };

type Watch = {
  /** Which element is playing right now (it swaps on a crossfade). */
  active: () => Playable | null;
  /** Whether skipping is on and something is playing. */
  wanted: () => boolean;
  /** The listener's chosen speed, to go back to when the sound returns. */
  speed: () => number;
};

/**
 * Plays long silences (a gap before a hidden track, a long quiet tail) at
 * SKIP_RATE, then drops back to the listener's speed when sound returns.
 * Speeding up rather than seeking means it never jumps past where the music
 * starts again. The level is the RMS of the engine's latest analysis frame
 * (0 for silence to about 0.7 for a full-scale sine). Returns a stop function.
 */
export function watchSilences({ active, wanted, speed }: Watch): () => void {
  let quietFor = 0;
  let boosted: Playable | null = null;
  let level: number | null = null;
  const unsubscribe = subscribeAnalysis((_bins, rms) => {
    level = rms;
  });
  const settle = () => {
    if (boosted) boosted.playbackRate = speed();
    boosted = null;
    quietFor = 0;
  };
  const timer = setInterval(() => {
    const el = active();
    if (!el || level === null || !wanted() || el.paused) return settle();
    // The element changed under us (a crossfade): its next load resets its rate.
    if (boosted && boosted !== el) boosted = null;
    if (boosted) {
      if (level > LOUD) settle();
      return;
    }
    quietFor = level < QUIET ? quietFor + TICK_MS : 0;
    // Not in the first second, so a quiet intro that's about to start isn't rushed.
    if (quietFor >= QUIET_MS && el.currentTime > 1) {
      el.playbackRate = speed() * SKIP_RATE;
      boosted = el;
    }
  }, TICK_MS);
  return () => {
    clearInterval(timer);
    unsubscribe();
    settle();
  };
}
