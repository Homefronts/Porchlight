import {
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import { useActiveLook } from "@/lib/theme/store";

type Kind =
  | "prev"
  | "play"
  | "pause"
  | "next"
  | "shuffle"
  | "repeat"
  | "repeat-one";

const TEXT: Record<Kind, string> = {
  prev: "◂◂ PREV",
  play: "▸ PLAY",
  pause: "❚❚ PAUSE",
  next: "NEXT ▸▸",
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
 * A transport button's face: text ("◂◂ PREV") when the look's
 * `textTransport` touch is on, else today's icon. The button keeps its own
 * aria-label either way.
 */
export function TransportLabel({ kind }: { kind: Kind }) {
  if (!useActiveLook().touches.textTransport) {
    const Icon = ICON[kind];
    const filled =
      kind === "prev" || kind === "play" || kind === "pause" || kind === "next";
    return <Icon className={filled ? "fill-current" : undefined} />;
  }
  return (
    <span data-transport={kind} className="font-meta text-[11px] tracking-[0.12em]">
      {TEXT[kind]}
    </span>
  );
}
