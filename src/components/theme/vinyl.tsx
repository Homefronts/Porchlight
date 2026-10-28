import { useActiveLook } from "@/lib/theme/store";
import { cn } from "@/lib/utils";

/**
 * A record peeking out from behind a cover. Drop it inside the cover's
 * positioned box; it sits behind the cover art (see `.vinyl` in index.css).
 * Renders nothing unless the look's `vinyl` touch is on.
 */
export function Vinyl({ className }: { className?: string }) {
  if (!useActiveLook().touches.vinyl) return null;
  return <div aria-hidden="true" className={cn("vinyl", className)} />;
}
