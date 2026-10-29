import { useEffect, type CSSProperties } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { welcomeCopy } from "@/lib/theme/first-launch";
import { FONT_STACKS } from "@/lib/theme/looks";

const serif = { fontFamily: FONT_STACKS["instrument-serif"] };
const mono = { fontFamily: FONT_STACKS["jetbrains-mono"] };
const at = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/**
 * The once-only Welcome before "Make it yours", in the liner-notes style on
 * whatever look is active. Plays through by itself; the parent also skips it
 * on any key. Lives inside the picker's dialog, so its heading is the title.
 */
export function Welcome({ updater, onDone }: { updater: boolean; onDone: () => void }) {
  const copy = welcomeCopy(updater);

  useEffect(() => {
    // Longer when there is a note to read.
    const t = setTimeout(onDone, updater ? 6500 : 5000);
    return () => clearTimeout(t);
  }, [onDone, updater]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <div aria-hidden="true" className="welcome-record relative mb-12 h-[180px] w-[292px]">
        <div className="welcome-slide absolute left-[6px] top-[6px] size-[168px]">
          <div
            className="welcome-spin flex size-full items-center justify-center rounded-full shadow-[inset_0_0_0_2px_#707070]"
            style={{ background: "repeating-radial-gradient(circle, #0c0c0c 0 3px, #2a2a2a 3px 4px)" }}
          >
            <img src="/ytubic-icon.svg" alt="" className="size-[58px] rounded-full" />
          </div>
        </div>
        <div className="absolute inset-y-0 left-0 z-10 w-[180px] rounded-[var(--radius-cover,4px)] border border-border bg-card shadow-lg">
          <div className="absolute bottom-4 left-4 h-1 w-10 bg-acc1" />
        </div>
      </div>

      <DialogPrimitive.Title
        className="welcome-line text-[56px] font-normal leading-none tracking-[-0.01em]"
        style={{ ...serif, ...at(1.1) }}
      >
        {copy.title}
      </DialogPrimitive.Title>
      <p className="welcome-line mt-3 text-2xl italic text-t6" style={{ ...serif, ...at(1.6) }}>
        {copy.tagline}
      </p>
      {copy.note && (
        <p className="welcome-line mt-8 max-w-md text-sm text-t3" style={at(2.3)}>
          {copy.note}
        </p>
      )}

      <p
        className="welcome-line absolute inset-x-0 bottom-7 text-[11px] tracking-[0.1em] text-t10"
        style={{ ...mono, ...at(2) }}
      >
        {copy.origin}
      </p>
      <Button variant="ghost" size="sm" onClick={onDone} className="absolute bottom-5 right-5">
        Skip
      </Button>
    </div>
  );
}
