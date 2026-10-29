import { useState, type ReactNode } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { useScrubStore } from "@/lib/store/scrub";
import { useActiveLook } from "@/lib/theme/store";
import { cn } from "@/lib/utils";

/** Tape-counter time: always two-digit minutes ("01:13"). */
export function tapeTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  /** Playback position, seconds. */
  current: number;
  /** Track length, seconds. */
  total: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  /** Extra classes for the counter row (spacing, time colour). */
  className?: string;
  /** Today's progress slider, rendered unchanged when the touch is off. */
  children: ReactNode;
};

/**
 * `01:13 ━━○── 03:36` when the look's `tapeCounter` touch is on, else the
 * existing slider passed as children. Radix keeps keyboard seeking. Mirrors
 * ProgressSlider's behaviour: drags go through the shared scrub store (the
 * lyrics preview reads it) and hovering shows the time under the pointer.
 */
export function TapeCounter({
  current,
  total,
  onSeek,
  disabled,
  className,
  children,
}: Props) {
  const on = useActiveLook().touches.tapeCounter;
  const scrub = useScrubStore((s) => s.scrub);
  const setScrub = useScrubStore((s) => s.setScrub);
  // Pointer position over the track, 0..1.
  const [hover, setHover] = useState<number | null>(null);
  if (!on) return children;

  const max = Math.max(total, 1);
  const shown = scrub ?? current;
  const tip = scrub !== null ? scrub / max : hover;
  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2.5 font-meta text-[11px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span>{tapeTime(shown)}</span>
      <div
        // Same 8px grace band above and below the track as ProgressSlider.
        className={cn(
          "relative flex-1 before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
          !disabled && "cursor-pointer",
        )}
        onMouseMove={(e) => {
          // The drag drives the tooltip while scrubbing.
          if (disabled || scrub !== null) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
          );
        }}
        onMouseLeave={() => setHover(null)}
      >
        {tip !== null ? (
          <div
            className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 rounded bg-black/85 px-2 py-0.5 text-sm font-medium tabular-nums text-white shadow"
            style={{ left: `${tip * 100}%` }}
          >
            {tapeTime(Math.round(tip * max))}
          </div>
        ) : null}
        <SliderPrimitive.Root
          value={[shown]}
          max={max}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => setScrub(v)}
          onValueCommit={([v]) => {
            onSeek(v);
            setScrub(null);
          }}
          className="relative flex h-4 cursor-pointer touch-none items-center select-none data-[disabled]:cursor-default data-[disabled]:opacity-50"
        >
          <SliderPrimitive.Track className="relative h-0.5 grow bg-border">
            <SliderPrimitive.Range className="absolute h-full bg-acc1" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Seek"
            className="block size-2 rounded-full bg-acc1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </SliderPrimitive.Root>
      </div>
      <span>{tapeTime(total)}</span>
    </div>
  );
}
