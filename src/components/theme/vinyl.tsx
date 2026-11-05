import type { ReactNode, Ref } from "react";
import { useActiveLook } from "@/lib/theme/store";
import { cn } from "@/lib/utils";

/**
 * A record peeking out from behind a cover. Drop it inside the cover's
 * positioned box; it sits behind the cover art (see `.vinyl` in index.css).
 * Renders nothing unless the look's `vinyl` touch is on, or `always` (a
 * turntable's record, which is the player and not a touch).
 */
export function Vinyl({
  className,
  always,
  children,
  ref,
}: {
  className?: string;
  always?: boolean;
  /** The record's label, laid over its centre. */
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const on = useActiveLook().touches.vinyl;
  if (!on && !always) return null;
  return (
    <div ref={ref} aria-hidden="true" className={cn("vinyl", className)}>
      {children}
    </div>
  );
}
