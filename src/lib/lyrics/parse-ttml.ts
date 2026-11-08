import { repairWords, type Lyrics, type TimedLine, type TimedWord } from "@/lib/lyrics/types";

/** "1:02:03.5", "02:03.5", "7.25s" or plain seconds -> seconds. */
function parseTime(t: string | null): number | null {
  if (!t) return null;
  const parts = t.trim().replace(/s$/, "").split(":").map(Number);
  if (parts.length > 3 || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const isBg = (n: Element) => n.getAttribute("ttm:role") === "x-bg";

function readLine(p: Element, agent?: string, fallback?: number): TimedLine | null {
  const first = p.querySelector("span[begin]")?.getAttribute("begin") ?? null;
  const start = parseTime(p.getAttribute("begin")) ?? (fallback === undefined ? null : parseTime(first) ?? fallback);
  if (start === null) return null;
  const words: TimedWord[] = [];
  let bg: TimedLine | undefined;
  let plain = "";
  for (const n of Array.from(p.childNodes)) {
    if (n.nodeType === 3) {
      const t = n.textContent ?? "";
      if (words.length && /^\s+$/.test(t)) {
        const w = words[words.length - 1];
        if (!/\s$/.test(w.text)) w.text += " ";
      } else plain += t;
    } else if (n.nodeType === 1) {
      const el = n as Element;
      if (isBg(el)) {
        bg = readLine(el, undefined, start) ?? undefined;
      } else {
        const ws = parseTime(el.getAttribute("begin"));
        const we = parseTime(el.getAttribute("end"));
        if (ws !== null) words.push({ start: ws, end: we ?? ws, text: el.textContent ?? "" });
        else plain += el.textContent ?? "";
      }
    }
  }
  const end = parseTime(p.getAttribute("end")) ?? (words.length ? words[words.length - 1].end : undefined);
  const text = (words.length ? words.map((w) => w.text).join("") : plain).replace(/\s+/g, " ").trim();
  const line: TimedLine = { start, text };
  if (end !== undefined) line.end = end;
  if (agent) line.agent = agent;
  if (words.length) line.words = repairWords(words, start, end ?? words[words.length - 1].end);
  if (bg) line.bg = bg;
  return line;
}

export function parseTTML(xml: string): Lyrics | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const ps = Array.from(doc.getElementsByTagName("p"));
  if (ps.length === 0) return null;
  const agents: Record<string, string> = {};
  for (const a of Array.from(doc.getElementsByTagName("ttm:agent"))) {
    const id = a.getAttribute("xml:id");
    const name = a.getElementsByTagName("ttm:name")[0]?.textContent?.trim();
    if (id) agents[id] = name || (a.getAttribute("type") === "group" ? "group" : id);
  }
  const lines = ps
    .map((p) => readLine(p, p.getAttribute("ttm:agent") ?? undefined))
    .filter((l): l is TimedLine => l !== null);
  lines.sort((a, b) => a.start - b.start);
  if (lines.length === 0) return null;
  return { kind: "timed", lines, ...(Object.keys(agents).length ? { agents } : {}) };
}
