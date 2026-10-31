import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { LAYOUT_NAMES } from "@/lib/theme/layouts";
import type { LayoutId } from "@/lib/theme/looks";
import { useThemeStore } from "@/lib/theme/store";

// `n` counts swaps so turning to the same name again still shows the card.
const useNameCard = create<{ id: LayoutId | null; n: number }>(() => ({ id: null, n: 0 }));

// One flip at a time: a turn during the first half retargets it, a turn
// during the second half just swaps.
let phase: "idle" | "out" | "in" = "idle";
let target: LayoutId = "sidebar";

const swap = (id: LayoutId) => {
  useThemeStore.getState().setLayout(id);
  useNameCard.setState((s) => ({ id, n: s.n + 1 }));
};

const PERSPECTIVE = "perspective(1800px)";

/**
 * Turns the app over like a record: the shell container ([data-layout-flip])
 * rotates edge-on, the layout swaps while it's unseen, and it turns back.
 * Only a CSS transform, so the page and the player stay mounted. Reduced
 * motion gets a plain fade.
 */
export function useLayoutFlip(): (id: LayoutId) => void {
  return useCallback((id: LayoutId) => {
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
      .catch(() => swap(target))
      .finally(() => {
        hold.cancel();
        phase = "idle";
      });
  }, []);
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
