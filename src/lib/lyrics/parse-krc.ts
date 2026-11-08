import { repairWords, type TimedLine, type TimedWord } from "@/lib/lyrics/types";

const KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

/** base64 -> skip "krc1" -> XOR key -> zlib inflate -> UTF-8 text. */
export async function decodeKRC(base64: string): Promise<string> {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).subarray(4);
  raw.forEach((b, i) => (raw[i] = b ^ KEY[i % 16]));
  const ds = new DecompressionStream("deflate");
  const w = ds.writable.getWriter();
  void w.write(raw);
  void w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

const decodeEntities = (s: string) =>
  s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const CREDIT_PREFIX = /^(lyrics by|composed by|作词|作曲|编曲)/i;
const CREDIT_COLON = /^.{0,11}[：:]/;

/** Credit lines: prefix match anywhere, "Label：" only before the first real lyric. */
export function dropCredits<T extends { text: string }>(lines: T[]): T[] {
  let lyricSeen = false;
  return lines.filter((l) => {
    if (CREDIT_PREFIX.test(l.text) || (!lyricSeen && CREDIT_COLON.test(l.text))) return false;
    lyricSeen = true;
    return true;
  });
}

function parseB64Json(b64: string): unknown {
  try {
    const bin = atob(b64);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

export function parseKRC(text: string): {
  lines: TimedLine[];
  romanByLine: (string | null)[];
} {
  let roman: string[] = [];
  const raw: TimedLine[] = [];
  for (const row of text.split(/\r?\n/)) {
    const lang = row.match(/^\[language:([^\]]*)\]/);
    if (lang) {
      // Untrusted Kugou data: any odd shape just means no romanization.
      const c = (parseB64Json(lang[1]) as { content?: unknown } | null)?.content;
      const r = Array.isArray(c)
        ? (c.find((x) => x?.type === 0) as { lyricContent?: unknown } | undefined)?.lyricContent
        : undefined;
      roman = Array.isArray(r) ? r.map((t) => (Array.isArray(t) ? t.join("").trim() : "")) : [];
      continue;
    }
    const m = row.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!m) continue;
    const start = +m[1] / 1000;
    const end = (+m[1] + +m[2]) / 1000;
    const words: TimedWord[] = [];
    for (const w of m[3].matchAll(/<(\d+),(\d+),\d+>([^<]*)/g)) {
      const ws = start + +w[1] / 1000;
      words.push({ start: ws, end: ws + +w[2] / 1000, text: decodeEntities(w[3]) });
    }
    const line: TimedLine = {
      start,
      end,
      text: decodeEntities(words.length ? words.map((w) => w.text).join("") : m[3].replace(/<[^>]*>/g, "")).trim(),
    };
    if (words.length) line.words = repairWords(words, start, end);
    raw.push(line);
  }
  // language block indexes lyric lines, not credit lines; align by raw index
  const kept = dropCredits(raw.map((l, i) => ({ text: l.text, l, i })));
  return { lines: kept.map((k) => k.l), romanByLine: kept.map((k) => roman[k.i] || null) };
}
