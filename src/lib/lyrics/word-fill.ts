import type { TimedWord } from "@/lib/lyrics/types";

/** 0..1 fill of a word at `position` seconds; NaN-safe for zero or negative length. */
export function wordFill(w: TimedWord, position: number): number {
  if (!Number.isFinite(position)) return 0;
  const len = w.end - w.start;
  if (!(len > 0)) return position >= w.start ? 1 : 0;
  return Math.min(1, Math.max(0, (position - w.start) / len));
}

/**
 * First agent seen in the song (`firstAgent`) is left, other singers right,
 * groups (id "v1000", or a name that is empty or "group") centered.
 */
export function lineAlign(
  agent: string | undefined,
  agents: Record<string, string> | undefined,
  firstAgent?: string,
): "left" | "right" | "center" {
  if (!agent || !agents) return "left";
  const name = agents[agent];
  if (agent === "v1000" || name === "" || name === "group") return "center";
  return firstAgent === undefined || agent === firstAgent ? "left" : "right";
}
