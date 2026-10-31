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
