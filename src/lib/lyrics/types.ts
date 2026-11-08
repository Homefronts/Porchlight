/** One word (or syllable) of a line; times are seconds, text keeps its trailing space. */
export type TimedWord = { start: number; end: number; text: string };

/**
 * A single line of synchronized lyrics.
 *
 * `start` is the second at which the line becomes active; `end` is when it
 * stops being active. Some lines have no text ("interlude" markers) — we
 * still render them so the highlight glides naturally.
 */
export type TimedLine = {
  start: number;
  end?: number;
  text: string;
  words?: TimedWord[]; // present only when the source has word timing
  agent?: string; // singer id ("v1", "v2", "v1000" for group), TTML only
  bg?: TimedLine; // background vocals under this line
  roman?: string; // source-provided romanization
  translation?: string;
};

export type Lyrics =
  | {
      kind: "timed";
      lines: TimedLine[];
      source?: string;
      agents?: Record<string, string>; // agent id -> singer name
    }
  | { kind: "plain"; text: string; source?: string };

export function hasWordTiming(l: Lyrics | null | undefined): boolean {
  return l?.kind === "timed" && l.lines.some((x) => (x.words?.length ?? 0) > 0);
}

/**
 * Fix messy word timing in place: clamp into the line, keep order, and give
 * zero-length words the next word's start (or the line end).
 */
export function repairWords(
  words: TimedWord[],
  lineStart: number,
  lineEnd: number,
): TimedWord[] {
  let prev = lineStart;
  for (const w of words) {
    w.start = Math.min(Math.max(w.start, prev, lineStart), lineEnd);
    prev = w.start;
  }
  words.forEach((w, i) => {
    const next = i + 1 < words.length ? words[i + 1].start : lineEnd;
    w.end = Math.min(w.end <= w.start ? next : w.end, lineEnd);
    if (w.end < w.start) w.end = w.start;
  });
  return words;
}
