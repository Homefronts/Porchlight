import { del, get, set } from "idb-keyval";
import { parseLRC } from "@/lib/lyrics/parse-lrc";
import { parseTTML } from "@/lib/lyrics/parse-ttml";
import type { Lyrics } from "@/lib/lyrics/types";

type Stored = { name: string; text: string; savedAt: number };
const key = (videoId: string) => `lyrics-file:${videoId}`;

function parse(name: string, text: string): Lyrics | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "ttml") return parseTTML(text);
  if (ext === "lrc") {
    const lines = parseLRC(text);
    return lines.length ? { kind: "timed", lines, source: "file" } : null;
  }
  return null;
}

/** Parses by extension; null means unreadable and nothing is saved. */
export async function saveLyricsFile(
  videoId: string,
  file: { name: string; text: string },
): Promise<Lyrics | null> {
  const lyrics = parse(file.name, file.text);
  if (lyrics) await set(key(videoId), { ...file, savedAt: Date.now() } satisfies Stored);
  return lyrics;
}

export async function loadLyricsFile(videoId: string): Promise<Lyrics | null> {
  const s = await get<Stored>(key(videoId));
  return s ? parse(s.name, s.text) : null;
}

export async function removeLyricsFile(videoId: string): Promise<void> {
  await del(key(videoId));
}
