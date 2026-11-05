import { useEffect, useRef } from "react";
import { usePlaybackStore } from "@/lib/store/playback";
import { useScrubStore } from "@/lib/store/scrub";

/** How far the drag winds the record: a whole song is a few turns, not a blur. */
const MS_PER_SONG_SECOND = 250;

/** The spin's time after scrubbing `delta` seconds, kept positive so it can wind back forever. */
export function platterTime(current: number, delta: number, turnMs: number): number {
  const t = (current + delta * MS_PER_SONG_SECOND) % turnMs;
  return t < 0 ? t + turnMs : t;
}

/**
 * Spins an element while `on`. Dragging the progress slider takes over: the
 * element follows the drag, backward when it goes backward, and holds still
 * when the drag does. Reduced motion leaves it still.
 */
export function usePlatter<E extends HTMLElement>(turnMs: number, on: boolean) {
  const ref = useRef<E>(null);
  const spin = useRef<Animation | null>(null);
  const spinning = useRef(on);
  spinning.current = on;

  useEffect(() => {
    const el = ref.current;
    if (!el?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anim = el.animate([{ rotate: "0deg" }, { rotate: "360deg" }], {
      duration: turnMs,
      iterations: Infinity,
    });
    spin.current = anim;
    if (!spinning.current) anim.pause();

    let last: number | null = null;
    const unsubscribe = useScrubStore.subscribe(({ scrub }) => {
      if (scrub === null) {
        last = null;
        if (spinning.current) anim.play();
        return;
      }
      if (last === null) {
        last = usePlaybackStore.getState().position;
        anim.pause();
      }
      anim.currentTime = platterTime(Number(anim.currentTime ?? 0), scrub - last, turnMs);
      last = scrub;
    });
    return () => {
      unsubscribe();
      anim.cancel();
      spin.current = null;
    };
  }, [turnMs]);

  useEffect(() => {
    if (useScrubStore.getState().scrub !== null) return;
    if (on) spin.current?.play();
    else spin.current?.pause();
  }, [on]);

  return ref;
}
