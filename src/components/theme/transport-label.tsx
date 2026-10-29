import {
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useActiveLook } from "@/lib/theme/store";
import { cn } from "@/lib/utils";
import { GLYPH } from "@/lib/theme/transport-glyphs";

type Kind =
  | "prev"
  | "play"
  | "pause"
  | "next"
  | "shuffle"
  | "repeat"
  | "repeat-one";

const TEXT: Record<Kind, string> = {
  prev: `${GLYPH.prev} PREV`,
  play: `${GLYPH.play} PLAY`,
  pause: `${GLYPH.pause} PAUSE`,
  next: `NEXT ${GLYPH.next}`,
  shuffle: "SHUF",
  repeat: "REP",
  "repeat-one": "REP 1",
};

const ICON = {
  prev: SkipBackIcon,
  play: PlayIcon,
  pause: PauseIcon,
  next: SkipForwardIcon,
  shuffle: ShuffleIcon,
  repeat: RepeatIcon,
  "repeat-one": Repeat1Icon,
};

/**
 * A transport button's face: text (`${GLYPH.prev} PREV`) when the look's
 * `textTransport` touch is on, else today's icon. The button keeps its own
 * aria-label either way.
 */
export function TransportLabel({
  kind,
  className,
  spinner,
}: {
  kind: Kind;
  /** Extra classes for the icon (its size); the text face ignores them. */
  className?: string;
  /** Set while loading: replaces the icon; the text face pulses instead. */
  spinner?: ReactNode;
}) {
  if (!useActiveLook().touches.textTransport) {
    if (spinner) return spinner;
    const Icon = ICON[kind];
    const filled =
      kind === "prev" || kind === "play" || kind === "pause" || kind === "next";
    return <Icon className={cn(filled && "fill-current", className)} />;
  }
  return (
    <span
      data-transport={kind}
      className={cn(
        "font-meta text-[11px] tracking-[0.12em]",
        spinner ? "animate-pulse" : null,
      )}
    >
      {TEXT[kind]}
    </span>
  );
}
