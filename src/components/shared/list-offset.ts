import { useLayoutEffect, useState, type RefObject } from "react";

/** How far down `scroller`'s content `list` starts (the virtualizer's scrollMargin). */
export function listOffset(list: HTMLElement, scroller: HTMLElement): number {
  return (
    list.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  );
}

/**
 * Whether a layout flip is turning the shell around `el`. The rotation skews
 * every rect inside it, and nothing resizes once it settles.
 */
export function flipping(el: HTMLElement): boolean {
  return !!el.closest("[data-layout-flip]")?.getAnimations?.().length;
}

/**
 * TrackList's scrollMargin, kept current: measured whenever the scroller
 * resolves or anything above the list changes height (cover image loads,
 * description expands, a layout swap), and never mid flip.
 */
export function useListOffset(
  listRef: RefObject<HTMLElement | null>,
  scrollEl: HTMLElement | null,
  dep: unknown,
): number {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    if (!scrollEl) return;
    let frame = 0;
    let tries = 0;
    const compute = () => {
      cancelAnimationFrame(frame);
      const list = listRef.current;
      if (!list) return;
      // A layout swap resizes mid flip; measure again once it has settled.
      if (flipping(scrollEl) && tries++ < 120) {
        frame = requestAnimationFrame(compute);
        return;
      }
      tries = 0;
      setOffset(listOffset(list, scrollEl));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(scrollEl);
    // Also observe the immediate parent (route content) so header
    // expansions trigger a recompute.
    if (listRef.current?.parentElement) ro.observe(listRef.current.parentElement);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [listRef, scrollEl, dep]);
  return offset;
}
