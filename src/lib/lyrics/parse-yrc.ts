import { repairWords, type TimedLine, type TimedWord } from "@/lib/lyrics/types";

/** NetEase YRC: `[startMs,durMs](wordStartMs,wordDurMs,0)word`, word starts absolute. */
export function parseYRC(yrc: string): TimedLine[] {
  const out: TimedLine[] = [];
  for (const row of yrc.split(/\r?\n/)) {
    const m = row.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!m) continue; // JSON credit objects and blanks
    const start = +m[1] / 1000;
    const end = (+m[1] + +m[2]) / 1000;
    const words: TimedWord[] = [];
    for (const w of m[3].matchAll(/\((\d+),(\d+),\d+\)([^(]*)/g)) {
      const ws = +w[1] / 1000;
      words.push({ start: ws, end: ws + +w[2] / 1000, text: w[3] });
    }
    const line: TimedLine = { start, end, text: words.map((w) => w.text).join("").trim() };
    if (words.length) line.words = repairWords(words, start, end);
    out.push(line);
  }
  return out;
}
