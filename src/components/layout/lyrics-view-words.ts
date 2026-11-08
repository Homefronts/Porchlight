import type { Availability } from "@/lib/lyrics/pick";
import type { TimedLine } from "@/lib/lyrics/types";

/** The first singer in line order; `lineAlign` puts them on the left. */
export function firstAgentOf(lines: TimedLine[]): string | undefined {
  return lines.find((l) => l.agent)?.agent;
}

/**
 * The singer's name above line `i` when a new singer starts there, else null.
 * Lines without an agent (interludes) don't count as a change. Groups and
 * singers with no real name (the parser falls back to the id) get no label.
 */
export function singerLabelAt(
  lines: TimedLine[],
  i: number,
  agents: Record<string, string> | undefined,
): string | null {
  const agent = lines[i]?.agent;
  if (!agent || !agents) return null;
  const name = agents[agent];
  if (!name || name === agent || name === "group" || agent === "v1000")
    return null;
  for (let j = i - 1; j >= 0; j--) {
    if (lines[j].agent) return lines[j].agent === agent ? null : name;
  }
  return name;
}

export function availabilityBadge(a: Availability): string | null {
  return a === "word"
    ? "WORD"
    : a === "line"
      ? "LINE"
      : a === "plain"
        ? "TEXT"
        : null;
}

/**
 * Playback position `now` ms after the store last ticked `base` at `at` ms.
 * The store ticks a few times a second; the cap covers stalled ticks. The
 * caller resets `at` on play/pause, or a resume would start up to a second ahead.
 */
export function extrapolate(
  base: number,
  at: number,
  now: number,
  playing: boolean,
): number {
  return playing ? base + Math.min(1, Math.max(0, (now - at) / 1000)) : base;
}

/** How long before a line's actual start time we flip it to active.
 *  At this moment the previous line's CSS transition begins fading it
 *  out and the new line's transition begins fading it in. The
 *  `duration-*` value on the line element controls how long that
 *  cross-fade takes — set a touch longer than the lookahead so the
 *  handoff feels smooth rather than crisp. */
const ACTIVE_LOOKAHEAD_S = 0.72;

/** With word timing on, a line stays active until its last word ends (capped
 *  at the next line's start), so a held last word still fills. */
export function findActiveIdx(lines: TimedLine[], position: number, wordByWord: boolean): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].start - ACTIVE_LOOKAHEAD_S;
    if (start > position) break;
    const nextStart = lines[i + 1]?.start;
    const words = wordByWord ? lines[i].words : undefined;
    const lastWordEnd = words?.[words.length - 1]?.end;
    const end =
      nextStart !== undefined
        ? Math.min(nextStart, Math.max(nextStart - ACTIVE_LOOKAHEAD_S, lastWordEnd ?? -Infinity))
        : (lines[i].end ?? Infinity);
    if (position < end) {
      active = i;
      break;
    }
    active = i;
  }
  return active;
}
