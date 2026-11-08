import { repairWords, type TimedLine, type TimedWord } from "@/lib/lyrics/types";

/**
 * Parse LRC text into timed lines.
 *
 * Format examples:
 *   [00:12.34]First line
 *   [00:15.67]Second line
 *   [00:15.67][00:20.00]Repeated line (chorus)
 *   [00:12]Line without centiseconds
 *
 * Lines without timestamps (metadata like `[ar:Artist]`) are skipped.
 * Each line's `end` is filled from the next line's `start` so the
 * highlight glides naturally between lines.
 */
const wordRe = /<(\d+):(\d+)(?:[.:](\d+))?>/g;
const tagSec = (m: RegExpMatchArray) =>
  parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0);

export function parseLRC(lrc: string): TimedLine[] {
  const tsRe = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
  const out: TimedLine[] = [];
  // Optional global shift tag. Per the LRC spec a positive [offset:+ms]
  // shifts the lyrics earlier, so we subtract it from every timestamp.
  const offsetMatch = lrc.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  const offsetSec = offsetMatch ? parseInt(offsetMatch[1], 10) / 1000 : 0;
  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(tsRe)];
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1];
    const body = rawLine.slice((last.index ?? 0) + last[0].length);
    const wordTags = [...body.matchAll(wordRe)];
    const text = body.replace(wordRe, "").trim();
    for (const m of matches) {
      const mm = parseInt(m[1], 10);
      const ss = parseInt(m[2], 10);
      const frac = m[3]
        ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10)
        : 0;
      if (Number.isNaN(mm) || Number.isNaN(ss)) continue;
      const start = Math.max(0, mm * 60 + ss + frac / 1000 - offsetSec);
      const line: TimedLine = { start, text };
      if (wordTags.length > 0) {
        const words: TimedWord[] = [];
        wordTags.forEach((t, i) => {
          const from = (t.index ?? 0) + t[0].length;
          const nx = wordTags[i + 1];
          const wText = body.slice(from, nx?.index ?? body.length);
          const ws = tagSec(t) - offsetSec;
          if (wText) words.push({ start: ws, end: nx ? tagSec(nx) - offsetSec : ws, text: wText });
        });
        if (words.length > 0) line.words = words;
      }
      out.push(line);
    }
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length - 1; i++) {
    out[i].end = out[i + 1].start;
  }
  for (const l of out) {
    if (l.words) repairWords(l.words, l.start, l.end ?? l.words[l.words.length - 1].end);
  }
  return out;
}
