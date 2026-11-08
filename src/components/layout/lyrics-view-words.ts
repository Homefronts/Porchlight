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
  if (!name || name === agent || name === "group" || agent === "v1000") return null;
  for (let j = i - 1; j >= 0; j--) {
    if (lines[j].agent) return lines[j].agent === agent ? null : name;
  }
  return name;
}

export function availabilityBadge(a: Availability): string | null {
  return a === "word" ? "WORD" : a === "line" ? "LINE" : a === "plain" ? "TEXT" : null;
}
