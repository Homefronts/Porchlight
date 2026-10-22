import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { IconPhotoDown, IconX } from "@tabler/icons-react";
import type { Rewind } from "@/lib/rewind/types";
import { Slide, slidesFor } from "./slides";

const SLIDE_MS = 9000;

// Slide motion (see slides.tsx), transform and opacity only. Reduced motion: all still.
const STORY_CSS = `
@keyframes rw-fill { from { width: 0% } to { width: 100% } }
@keyframes rw-drift { to { transform: translate(var(--dx, 0), var(--dy, 0)) } }
@keyframes rw-breathe { 50% { transform: scale(1.1) } }
@keyframes rw-turn { to { transform: rotate(360deg) } }
@keyframes rw-float { 0%, 100% { transform: rotate(8deg) } 50% { transform: translateY(-3cqw) rotate(4deg) } }
@keyframes rw-spin-in { from { transform: rotate(-50deg) scale(0.4); opacity: 0 } to { transform: rotate(8deg) scale(1); opacity: 1 } }
@keyframes rw-wobble { 0%, 100% { transform: rotate(0deg) scale(1) } 50% { transform: rotate(30deg) scale(1.12, 0.9) } }
@keyframes rw-rise { from { transform: translateY(5cqw); opacity: 0 } }
@keyframes rw-grow { from { transform: scaleY(0) } }
@keyframes rw-pop { from { transform: scale(0.8); opacity: 0 } }
@keyframes rw-bob { 50% { transform: translateY(-4cqw) rotate(-6deg) } }
@keyframes rw-swing { 0%, 100% { transform: rotate(9deg) } 50% { transform: rotate(-9deg) } }
@keyframes rw-eq { from { transform: scaleY(0.2) } to { transform: scaleY(1) } }
@keyframes rw-thump { 0%, 60%, 100% { transform: scale(1) } 15% { transform: scale(1.05) } }
@keyframes rw-twinkle { 0%, 100% { transform: scale(0.4); opacity: 0.25 } 50% { transform: scale(1); opacity: 1 } }
@keyframes rw-fall { from { transform: translateY(-6cqmin) rotate(0deg) } to { transform: translateY(62cqh) rotate(540deg) } }
@keyframes rw-dawn { from { transform: translateY(25cqw); opacity: 0 } }
@media (prefers-reduced-motion: reduce) { [data-slide], [data-slide] * { animation: none !important } }
`;

/**
 * Full-screen, year-in-review style story. Tap or click the right/left half, swipe,
 * or use ←/→ to move; hold to pause; Esc closes. Only the current slide and
 * the next one are mounted, and nothing runs once it's closed. Drawn on <body>,
 * above the player bar; only the window's own title bar stays on top.
 */
export function RewindStory({
  rewind,
  onClose,
  onSave,
}: {
  rewind: Rewind;
  onClose: () => void;
  onSave?: (node: HTMLElement, name: string) => void;
}) {
  const slides = useMemo(() => slidesFor(rewind), [rewind]);
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; t: number } | null>(null);

  const go = useCallback((d: number) => setI((n) => Math.max(0, Math.min(slides.length - 1, n + d))), [slides.length]);

  useEffect(() => {
    // Capture phase + preventDefault: AppShell's Space-to-play skips handled keys.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  // Auto-advance, paused while held and on the last slide.
  useEffect(() => {
    if (held || i >= slides.length - 1) return;
    const t = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, held, go, slides.length]);

  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, t: Date.now() };
    setHeld(true);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setHeld(false);
    const d = down.current;
    down.current = null;
    if (!d || Date.now() - d.t > 400) return; // a hold, not a tap
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 50) return go(dx < 0 ? 1 : -1);
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    go(e.clientX - box.left > box.width / 3 ? 1 : -1);
  };

  const s = slides[i];
  const next = slides[i + 1];
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true" aria-label="Rewind">
      {/* The whole window, like the fullscreen player. */}
      <div className="absolute inset-0">
      <div
        ref={stage}
        className={reduced ? "absolute inset-0" : "absolute inset-0 animate-in fade-in duration-300"}
        key={i}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setHeld(false)}
      >
        <Slide s={s} r={rewind} current />
        {next ? <Slide s={next} r={rewind} current={false} /> : null}
      </div>

      <div className="pointer-events-none absolute inset-x-4 top-[calc(var(--titlebar-h)+0.5rem)] flex gap-1">
        {slides.map((_, n) => (
          <div key={n} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35 shadow-[0_0_3px_rgb(0_0_0/0.35)]">
            <div
              className="h-full bg-white"
              style={
                n === i && !reduced && i < slides.length - 1
                  ? { animation: `rw-fill ${SLIDE_MS}ms linear forwards`, animationPlayState: held ? "paused" : "running" }
                  : { width: n <= i ? "100%" : "0%" }
              }
            />
          </div>
        ))}
      </div>
      </div>

      <div className="absolute right-3 top-[calc(var(--titlebar-h)+1.25rem)] flex gap-1">
        {onSave ? (
          <button
            type="button"
            aria-label="Save slide as image"
            className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => {
              const node = stage.current?.querySelector<HTMLElement>("[data-slide-current]");
              if (node) onSave(node, `rewind-${rewind.quarter}-${i + 1}.png`);
            }}
          >
            <IconPhotoDown className="size-5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Close Rewind"
          className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <IconX className="size-5" />
        </button>
      </div>
      <style>{STORY_CSS}</style>
    </div>,
    document.body,
  );
}
