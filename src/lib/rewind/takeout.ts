/**
 * Google Takeout import, parsed on this computer. Pure (no app imports) so it
 * runs inside the import worker. Only the open quarter is read.
 */
import { quarterOf, quarterRange, type QuarterId } from "./quarter";
import type { Play } from "./types";

/** A play followed by the next one sooner than this was skipped. */
const SKIP_SEC = 30;

type Entry = {
  header?: string;
  title?: string;
  titleUrl?: string;
  subtitles?: { name?: string; url?: string }[];
  time?: string;
};

const videoIdOf = (url: string) => {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
};

export function parseTakeout(json: unknown, q: QuarterId): Play[] {
  if (!Array.isArray(json)) return [];
  const { start, end } = quarterRange(q);
  const plays: Play[] = [];
  for (const e of json as Entry[]) {
    if (!e || typeof e !== "object" || !e.titleUrl || !e.time) continue;
    const music = e.header === "YouTube Music" || e.titleUrl.includes("music.youtube.com");
    const id = music ? videoIdOf(e.titleUrl) : null;
    const t = Date.parse(e.time);
    if (!id || !(t >= start && t < end)) continue;
    const s = e.subtitles?.[0];
    const channel = s?.url?.match(/\/channel\/([\w-]+)/)?.[1];
    plays.push({
      videoId: id,
      title: (e.title ?? "").replace(/^Watched /, ""),
      artists: s?.name ? [{ ...(channel && { id: channel }), name: s.name.replace(/ - Topic$/, "") }] : [],
      startedAt: t,
      playedSec: 0,
      counted: true,
      source: "takeout",
    });
  }
  plays.sort((a, b) => a.startedAt - b.startedAt);
  return plays.filter((p, i) => {
    const next = plays[i + 1];
    return !next || next.startedAt - p.startedAt >= SKIP_SEC * 1000;
  });
}

const HISTORY = /watch-history\.(json|html)$/i;

/** A Takeout watch history, whatever the export's language calls the file. */
function looksLikeHistory(text: string): boolean {
  try {
    const j = JSON.parse(text) as Entry[];
    return Array.isArray(j) && j.slice(0, 20).some((e) => !!e?.titleUrl && !!e?.time);
  } catch {
    return false;
  }
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const out = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// shortcut: plain zip only (no zip64), fine for a history-only Takeout export;
// add zip64 if users pick a full export over 4 GB.
async function fromZip(b: Uint8Array): Promise<Uint8Array | "html" | null> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  let html = false;
  const candidates: (() => Promise<Uint8Array>)[] = [];
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra;
    const read = () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = b.subarray(start, start + size);
      return method === 8 ? inflate(raw) : Promise.resolve(raw);
    };
    const m = name.match(HISTORY);
    if (m?.[1].toLowerCase() === "html") html = true;
    else if (m) return read();
    // Non-English exports name the file in their language: keep YouTube JSONs to sniff.
    else if (/youtube/i.test(name) && name.toLowerCase().endsWith(".json")) candidates.push(read);
  }
  for (const read of candidates) {
    const data = await read();
    if (looksLikeHistory(new TextDecoder().decode(data))) return data;
  }
  return html ? "html" : null;
}

/** The watch history JSON text from a Takeout .zip or a bare file. */
export async function findWatchHistory(
  bytes: Uint8Array,
  fileName: string,
): Promise<{ json: string } | { error: "html" | "invalid" }> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const found = isZip ? await fromZip(bytes).catch(() => null) : bytes;
  if (found === "html" || (!isZip && /\.html?$/i.test(fileName))) return { error: "html" };
  if (!found) return { error: "invalid" };
  return { json: new TextDecoder().decode(found) };
}

export type ImportResult = { added: number } | { error: "html" | "invalid" | "empty" | "cancelled" };

/** Import the open quarter from a Takeout file chosen by the user. */
export async function importTakeout(file: File, signal?: AbortSignal): Promise<ImportResult> {
  // Lazy, so the worker bundle that imports this file stays free of storage code.
  const { rewindLog } = await import("./log");
  const quarter = quarterOf(Date.now());
  const worker = new Worker(new URL("./takeout.worker.ts", import.meta.url), { type: "module" });
  try {
    const bytes = await file.arrayBuffer();
    const res = await new Promise<{ plays?: Play[]; error?: "html" | "invalid" }>((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = () => resolve({ error: "invalid" });
      worker.postMessage({ bytes, name: file.name, quarter }, [bytes]);
    });
    if (res.error) return { error: res.error };
    if (!res.plays?.length) return { error: "empty" };
    return { added: await rewindLog.addImported(quarter, res.plays) };
  } catch {
    return { error: signal?.aborted ? "cancelled" : "invalid" };
  } finally {
    worker.terminate();
  }
}
