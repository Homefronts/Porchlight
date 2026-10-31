import { useEffect, useRef, type KeyboardEvent } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { LAYOUT_NAMES, LAYOUT_ORDER, nextLayout } from "@/lib/theme/layouts";
import { useThemeStore } from "@/lib/theme/store";
import { cn } from "@/lib/utils";
import { useLayoutFlip } from "./layout-flip";

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
 * The layout switch by the logo. A click turns it one notch, the wheel and
 * the arrow keys turn it either way. Screen readers hear a radio group.
 */
export function TurntableDial() {
  const layout = useThemeStore((s) => s.layout);
  const tip = useThemeStore((s) => s.pickerSeen && !s.dialTipSeen);
  const flip = useLayoutFlip();
  const ref = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);
  const at = LAYOUT_ORDER.indexOf(layout);

  const seeTip = () => useThemeStore.setState({ dialTipSeen: true });
  const turn = (dir: 1 | -1) => {
    if (useThemeStore.getState().dialSound) click();
    seeTip();
    flip(nextLayout(layout, dir));
  };

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
    <Popover open={tip} onOpenChange={(open) => !open && seeTip()}>
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
              className="absolute inset-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ rotate: `${ANGLES[i]}deg` }}
            >
              <i
                className={cn(
                  "absolute left-1/2 top-0 h-1 w-0.5 -translate-x-1/2 rounded-full",
                  i === at ? "bg-acc1" : "bg-t10",
                )}
              />
            </span>
          ))}
          <span
            aria-hidden="true"
            className="absolute inset-[6px] rounded-full border border-w110 bg-w050 shadow-[inset_0_-1px_2px_var(--k550)] transition-[rotate] duration-200 ease-out motion-reduce:transition-none"
            style={{ rotate: `${ANGLES[at]}deg` }}
          >
            <i className="absolute left-1/2 top-[2px] h-[5px] w-0.5 -translate-x-1/2 rounded-full bg-t1" />
          </span>
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
