import { useEffect, useState } from "react";
import { create } from "zustand";
import { LAYOUT_NAMES, nextLayout, shouldCycleOnKey } from "@/lib/theme/layouts";
import type { LayoutId } from "@/lib/theme/looks";
import { useThemeStore } from "@/lib/theme/store";

// `n` counts swaps so turning to the same name again still shows the card.
export const useNameCard = create<{ id: LayoutId | null; n: number }>(() => ({ id: null, n: 0 }));

// One flip at a time: a turn during the first half retargets it, a turn
// during the second half just swaps.
let phase: "idle" | "out" | "in" = "idle";
let target: LayoutId = "sidebar";

const swap = (id: LayoutId) => {
  useThemeStore.getState().setLayout(id);
  useNameCard.setState((s) => ({ id, n: s.n + 1 }));
};

const PERSPECTIVE = "perspective(1800px)";

/** Where the next turn steps from: the pending layout while a flip is under way. */
export function turnFrom(): LayoutId {
  return phase === "out" ? target : useThemeStore.getState().layout;
}

/**
 * Turns the app over like a record: the shell container ([data-layout-flip])
 * rotates edge-on, the layout swaps while it's unseen, and it turns back.
 * Only a CSS transform, so the page and the player stay mounted. Reduced
 * motion gets a plain fade.
 */
export function flipTo(id: LayoutId): void {
  target = id;
  if (phase === "out") return;
  const el = document.querySelector<HTMLElement>("[data-layout-flip]");
  if (phase === "in" || !el?.animate) return swap(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [out, back] = reduce
    ? [[{ opacity: 1 }, { opacity: 0 }], [{ opacity: 0 }, { opacity: 1 }]]
    : [
        [{ transform: `${PERSPECTIVE} rotateY(0deg)` }, { transform: `${PERSPECTIVE} rotateY(90deg)` }],
        [{ transform: `${PERSPECTIVE} rotateY(-90deg)` }, { transform: `${PERSPECTIVE} rotateY(0deg)` }],
      ];
  const duration = reduce ? 120 : 200;
  phase = "out";
  // Held edge-on until the second half takes over, so nothing flashes between.
  const hold = el.animate(out, { duration, easing: "ease-in", fill: "forwards" });
  void hold.finished
    .then(() => {
      phase = "in";
      swap(target);
      return el.animate(back, { duration, easing: "ease-out" }).finished;
    })
    // Cancelled before the swap: still land on the target, once.
    .catch(() => {
      if (phase === "out") swap(target);
    })
    .finally(() => {
      hold.cancel();
      phase = "idle";
    });
}

/** Ctrl+L: the next layout, once the first-launch picker is done. */
export function cycleOnKey(e: Parameters<typeof shouldCycleOnKey>[0]): boolean {
  if (!shouldCycleOnKey(e) || !useThemeStore.getState().pickerSeen) return false;
  // A swap remounts TopBar, which would drop an open dialog (a half-typed report).
  if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return false;
  flipTo(nextLayout(turnFrom()));
  return true;
}

/** The small card naming the new layout for about a second. */
export function LayoutNameCard() {
  const { id, n } = useNameCard();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!n) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 1000);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-1/2 z-[60] flex -translate-y-1/2 justify-center">
      {shown && id ? (
        <span
          key={n}
          className="whats-new-enter rounded-[var(--radius-button,10px)] border border-border bg-popover px-4 py-2 font-meta text-xs uppercase tracking-[0.14em] text-t1 shadow-md"
        >
          {LAYOUT_NAMES[id]}
        </span>
      ) : null}
    </div>
  );
}
