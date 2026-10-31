import { useEffect, useState } from "react";
import { pickHighResThumbnail } from "@/components/shared/thumbnail";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";

/**
 * Stretched, heavily-blurred copy of the current track's cover. Sits
 * between the solid `bg-background` and the rest of the UI so the
 * window picks up a subtle tint of whatever is playing.
 *
 * Two layered <img>s crossfade between tracks: a new URL goes into
 * whichever slot is currently inactive, then we flip `active`, and
 * the CSS opacity transition fades the old slot out while the new
 * slot fades in.
 */
export function BackgroundCover() {
  const track = usePlaybackStore(currentTrack);
  const url =
    track?.thumbnails && track.thumbnails.length > 0
      ? pickHighResThumbnail(track.thumbnails)
      : null;

  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [active, setActive] = useState<"A" | "B">("A");

  useEffect(() => {
    if (!url) return;
    const currentSlot = active === "A" ? slotA : slotB;
    if (url === currentSlot) return;
    if (active === "A") {
      setSlotB(url);
      setActive("B");
    } else {
      setSlotA(url);
      setActive("A");
    }
  }, [url, active, slotA, slotB]);

  // The wash is tuned per theme, as in the prototype: on a dark ground
  // the art is saturated and left dark, on a light one it is brightened
  // and desaturated, or it settles as a grey haze over the white page.
  const baseClass =
    "pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-3xl " +
    "saturate-[0.9] brightness-[1.4] dark:saturate-150 dark:brightness-100 " +
    "transition-opacity duration-700 ease-out";

  // Held on the element rather than inline, so the visible slot can carry
  // a different value per theme. On a light page the wash reads much
  // louder at the same alpha: it tints white, where on a dark one it only
  // lifts an already dark ground.
  const shown = "opacity-[0.15] dark:opacity-30";

  return (
    <>
      {slotA && (
        <img
          src={slotA}
          alt=""
          aria-hidden
          className={`${baseClass} ${active === "A" ? shown : "opacity-0"}`}
        />
      )}
      {slotB && (
        <img
          src={slotB}
          alt=""
          aria-hidden
          className={`${baseClass} ${active === "B" ? shown : "opacity-0"}`}
        />
      )}
      {(slotA || slotB) && (
        <div
          aria-hidden
          className="bg-cover-noise pointer-events-none absolute inset-0"
        />
      )}
    </>
  );
}
