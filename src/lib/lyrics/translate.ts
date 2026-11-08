import { createDeadline, lyricsFetch } from "./http";

const ENDPOINT = "https://clients5.google.com/translate_a/t";
const MAX_LINES = 40;
const MAX_ENCODED = 3500;

const primary = (tag: string) => tag.toLowerCase().split(/[-_]/)[0];
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Translate lyric lines. Best effort: a line comes back null when there is
 * nothing worth showing (already in the target language, blank, or unchanged),
 * and every failure resolves to nulls rather than throwing.
 */
export async function translateLines(
  lines: string[],
  target: string,
  signal?: AbortSignal,
): Promise<(string | null)[]> {
  const out: (string | null)[] = lines.map(() => null);
  const idx = lines.flatMap((l, i) => (l.trim() && l.trim() !== "♪" ? [i] : []));

  // Greedy batches capped by line count and URL-encoded size.
  const batches: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  for (const i of idx) {
    const n = encodeURIComponent(lines[i]).length;
    if (cur.length && (cur.length >= MAX_LINES || size + n > MAX_ENCODED)) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += n;
  }
  if (cur.length) batches.push(cur);

  const want = primary(target);
  for (const batch of batches) {
    const deadline = createDeadline(signal);
    try {
      const qs = batch.map((i) => `&q=${encodeURIComponent(lines[i])}`).join("");
      const url = `${ENDPOINT}?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(target)}${qs}`;
      const res = await lyricsFetch(url, deadline, {});
      if (!res.ok) return out.map(() => null);
      const data: unknown = await res.json();
      if (!Array.isArray(data) || data.length !== batch.length) {
        return out.map(() => null);
      }
      batch.forEach((i, k) => {
        const e = data[k];
        const text = Array.isArray(e) ? e[0] : e;
        const lang = Array.isArray(e) && typeof e[1] === "string" ? e[1] : "";
        if (typeof text !== "string" || !text.trim()) return;
        if (lang && primary(lang) === want) return;
        if (norm(text) === norm(lines[i])) return;
        out[i] = text;
      });
    } catch {
      return out.map(() => null);
    } finally {
      deadline.done();
    }
  }
  return out;
}
