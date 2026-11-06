import { currentAnalyser } from "@/lib/audio-graph";

/** Below this level (about -48 dB) a stretch counts as silence. */
const QUIET = 0.004;
/** Sound comes back above this. A little higher, so a fade-out doesn't flicker. */
const LOUD = 0.01;
/** How long it has to stay quiet before it's skipped, so short pauses in a song stay. */
const QUIET_MS = 1500;
/** How fast a silence plays out. The audio is silent anyway, so nothing sounds sped up. */
export const SKIP_RATE = 4;
const TICK_MS = 150;

type Watch = {
  /** Which element is playing right now (it swaps on a crossfade). */
  active: () => HTMLMediaElement | null;
  /** Whether skipping is on and something is playing. */
  wanted: () => boolean;
  /** The listener's chosen speed, to go back to when the sound returns. */
  speed: () => number;
};

/** RMS of one time-domain frame, 0 for silence to about 0.7 for a full-scale sine. */
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (const v of frame) sum += v * v;
  return Math.sqrt(sum / (frame.length || 1));
}

/**
 * Plays long silences (a gap before a hidden track, a long quiet tail) at
 * SKIP_RATE, then drops back to the listener's speed when sound returns.
 * Speeding up rather than seeking means it never jumps past where the music
 * starts again. Returns a stop function.
 */
export function watchSilences({ active, wanted, speed }: Watch): () => void {
  let quietFor = 0;
  let boosted: HTMLMediaElement | null = null;
  let frame = new Float32Array(0);
  const settle = () => {
    if (boosted) boosted.playbackRate = speed();
    boosted = null;
    quietFor = 0;
  };
  const timer = setInterval(() => {
    const el = active();
    const analyser = currentAnalyser();
    if (!el || !analyser || !wanted() || el.paused) return settle();
    // The element changed under us (a new track loaded): its rate is already reset.
    if (boosted && boosted !== el) boosted = null;
    if (frame.length !== analyser.fftSize) frame = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(frame);
    const level = rms(frame);
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
    settle();
  };
}
