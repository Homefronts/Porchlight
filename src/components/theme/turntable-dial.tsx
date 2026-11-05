import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { dialTipOpen, LAYOUT_NAMES, LAYOUT_ORDER, nextLayout } from "@/lib/theme/layouts";
import type { LayoutId } from "@/lib/theme/looks";
import { useThemeStore } from "@/lib/theme/store";
import { cn } from "@/lib/utils";
import { flipTo, turnFrom } from "./layout-flip";

// Notch angles across the top of the knob, like a 33/45 speed switch.
const ANGLES = [-64, -32, 0, 32, 64];

const KEYS: Record<string, 1 | -1> = {
  ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, " ": 1, Enter: 1,
};

let audio: AudioContext | undefined;

/** A short synthesized tick; nothing is fetched. */
function click() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "square";
    osc.frequency.value = 1700;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.03);
  } catch {
    // No audio device; the turn still happens.
  }
}

/**
 * True while a dialog (not a popover, which Radix also marks role=dialog)
 * is still in the page. A closing dialog stays mounted with data-state
 * "closed" until its exit animation ends, and that is still in the way.
 */
export function anyDialogOpen(doc: Document = document): boolean {
  return [...doc.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(
    (el) => !el.closest("[data-radix-popper-content-wrapper]"),
  );
}

function useDialogOpen(): { open: boolean; holding: () => boolean } {
  const [open, setOpen] = useState(() => anyDialogOpen());
  const was = useRef(false);
  const hold = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Captured here: a mutation callback can run where `window` is missing.
    const cancel = clearTimeout;
    const schedule = setTimeout;
    const check = () => {
      if (timer !== undefined) cancel(timer);
      if (anyDialogOpen()) {
        was.current = true;
        hold.current = true;
        setOpen(true);
        return;
      }
      if (!was.current) {
        hold.current = false;
        setOpen(false);
        return;
      }
      // Focus leaves the dialog as it unmounts. Opening the tip in that
      // same turn lets the focus move dismiss it, and seeTip would run.
      was.current = false;
      hold.current = true;
      timer = schedule(() => {
        hold.current = false;
        setOpen(anyDialogOpen());
      }, 0);
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "role"] });
    check();
    return () => {
      if (timer !== undefined) cancel(timer);
      mo.disconnect();
    };
  }, []);
  return { open, holding: () => hold.current };
}

/**
 * The layout switch by the logo. A click turns it one notch, the wheel and
 * the arrow keys turn it either way. Screen readers hear a radio group.
 */
export function TurntableDial() {
  const layout = useThemeStore((s) => s.layout);
  // The collapsed rail hides the dial, so the tip waits for it to open.
  const expanded = useSidebar().state === "expanded";
  // What's New opens on the same first launch; showing the tip under it lets
  // the dialog's focus dismiss the tip unseen, so it waits for dialogs to close.
  const dialog = useDialogOpen();
  const tip = useThemeStore((s) => dialTipOpen(s, expanded)) && !dialog.open;
  const ref = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);
  const at = LAYOUT_ORDER.indexOf(layout);

  const seeTip = () => useThemeStore.setState({ dialTipSeen: true });
  const go = (id: LayoutId) => {
    if (useThemeStore.getState().dialSound) click();
    seeTip();
    flipTo(id);
  };
  const turn = (dir: 1 | -1) => go(nextLayout(turnFrom(), dir));

  // Keep keyboard focus on the lit notch as it moves.
  useEffect(() => {
    const el = ref.current;
    if (el?.contains(document.activeElement)) {
      el.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    }
  }, [layout]);

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = KEYS[e.key];
    if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    turn(dir);
  };

  return (
    <Popover
      open={tip}
      onOpenChange={(open) => !open && !anyDialogOpen() && !dialog.holding() && seeTip()}
    >
      <PopoverAnchor asChild>
        <div
          ref={ref}
          role="radiogroup"
          aria-label="Layout"
          title={LAYOUT_NAMES[layout]}
          onClick={() => turn(1)}
          onKeyDown={onKeyDown}
          onWheel={(e) => {
            // One notch per flick, however many events a trackpad sends.
            if (!e.deltaY || e.timeStamp - lastWheel.current < 250) return;
            lastWheel.current = e.timeStamp;
            turn(e.deltaY > 0 ? 1 : -1);
          }}
          className="relative size-7 shrink-0 cursor-pointer select-none"
        >
          {LAYOUT_ORDER.map((id, i) => (
            <span
              key={id}
              role="radio"
              aria-checked={i === at}
              aria-label={LAYOUT_NAMES[id]}
              tabIndex={i === at ? 0 : -1}
              // Activating a notch (a screen reader's click) picks it; the
              // pointer goes through to the knob, where a click turns one notch.
              onClick={(e) => {
                e.stopPropagation();
                if (id !== turnFrom()) go(id);
              }}
              className="pointer-events-none absolute inset-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ rotate: `${ANGLES[i]}deg` }}
            >
              <i
                className={cn(
                  "absolute left-1/2 top-px size-[3px] -translate-x-1/2 rounded-full transition-colors",
                  i === at ? "bg-acc1" : "bg-t10",
                )}
              />
            </span>
          ))}
          <span aria-hidden="true" className="absolute inset-[9px] rounded-full bg-t1" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        sideOffset={10}
        className="w-auto px-3 py-2 text-xs text-t1"
        // The tip points at the dial; it shouldn't take focus from the app.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={seeTip}
      >
        Turn this to change layouts.
      </PopoverContent>
    </Popover>
  );
}
