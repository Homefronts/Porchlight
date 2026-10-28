import { useState, type ReactNode } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { useActiveLook } from "@/lib/theme/store";

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
  /** Today's progress slider, rendered unchanged when the touch is off. */
  children: ReactNode;
};

/**
 * `01:13 ━━○── 03:36` when the look's `tapeCounter` touch is on, else the
 * existing slider passed as children. Radix keeps keyboard seeking.
 */
export function TapeCounter({
  current,
  total,
  onSeek,
  disabled,
  children,
}: Props) {
  const on = useActiveLook().touches.tapeCounter;
  const [scrub, setScrub] = useState<number | null>(null);
  if (!on) return children;

  const shown = scrub ?? current;
  return (
    <div className="mt-3 flex items-center gap-2.5 font-meta text-[11px] tabular-nums text-muted-foreground">
      <span>{tapeTime(shown)}</span>
      <SliderPrimitive.Root
        value={[shown]}
        max={Math.max(total, 1)}
        step={1}
        disabled={disabled}
        onValueChange={([v]) => setScrub(v)}
        onValueCommit={([v]) => {
          onSeek(v);
          setScrub(null);
        }}
        className="relative flex h-4 flex-1 cursor-pointer touch-none items-center select-none data-[disabled]:cursor-default data-[disabled]:opacity-50"
      >
        <SliderPrimitive.Track className="relative h-0.5 grow bg-border">
          <SliderPrimitive.Range className="absolute h-full bg-acc1" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="Seek"
          className="block size-2 rounded-full bg-acc1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </SliderPrimitive.Root>
      <span>{tapeTime(total)}</span>
    </div>
  );
}
