import type { Lyrics, TimedLine } from "@/lib/lyrics/types";
import { parseLRC } from "@/lib/lyrics/parse-lrc";
import { parseYRC } from "@/lib/lyrics/parse-yrc";
import { dropCredits } from "@/lib/lyrics/parse-krc";
import { selectBest } from "@/lib/lyrics/score";
import { createDeadline, lyricsFetch, throwForStatus } from "@/lib/lyrics/http";
import { enabledSources, useLyricsSettings } from "@/lib/store/lyrics-settings";

const NETEASE_BASE = "https://music.163.com";
// Generic UA only: no cookies, no account data ever go to this host.
const HEADERS = { "User-Agent": "Mozilla/5.0" };

type Song = { id?: number; name?: string; artists?: { name?: string }[]; duration?: number };
type LyricBlock = { lyric?: string } | null | undefined;

export async function fetchNeteaseLyrics(
  p: { title: string; artist?: string; duration?: number },
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  if (!enabledSources(useLyricsSettings.getState()).includes("netease")) throw new Error("consent");
  if (!p.title) return null;

  const deadline = createDeadline(signal);
  try {
    const search = new URL(`${NETEASE_BASE}/api/search/get`);
    search.search = new URLSearchParams({
      s: p.artist ? `${p.artist} ${p.title}` : p.title,
      type: "1",
      limit: "10",
    }).toString();
    const sr = await lyricsFetch(search.toString(), deadline, HEADERS);
    if (!sr.ok) throwForStatus(sr.status, "NetEase search");
    const songs = ((await sr.json()) as { result?: { songs?: Song[] } }).result?.songs ?? [];

    const best = selectBest(
      { title: p.title, artist: p.artist, durationSec: p.duration },
      songs.map((s) => ({
        ...s,
        trackName: s.name,
        artistName: s.artists?.[0]?.name,
        duration: typeof s.duration === "number" ? s.duration / 1000 : undefined,
      })),
      { bodyUnknown: true },
    );
    if (best?.record.id == null) return null;

    const lr = new URL(`${NETEASE_BASE}/api/song/lyric/v1`);
    lr.search = new URLSearchParams({ id: String(best.record.id), lv: "1", tv: "1", rv: "1", yv: "1" }).toString();
    const r = await lyricsFetch(lr.toString(), deadline, HEADERS);
    if (!r.ok) throwForStatus(r.status, "NetEase lyric");
    const j = (await r.json()) as { yrc?: LyricBlock; lrc?: LyricBlock; romalrc?: LyricBlock };

    const lines: TimedLine[] = j.yrc?.lyric ? parseYRC(j.yrc.lyric) : [];
    if (!lines.length && j.lrc?.lyric) lines.push(...dropCredits(parseLRC(j.lrc.lyric)));
    if (!lines.length) return null;

    // Attach each romanized line to the lyric line starting nearest (within 0.6 s).
    const roman = j.romalrc?.lyric ? parseLRC(j.romalrc.lyric) : [];
    for (const l of lines) {
      let near: TimedLine | undefined;
      for (const rl of roman) {
        if (Math.abs(rl.start - l.start) <= 0.6 && (!near || Math.abs(rl.start - l.start) < Math.abs(near.start - l.start))) near = rl;
      }
      if (near?.text) l.roman = near.text;
    }
    return { kind: "timed", lines, source: "netease" };
  } finally {
    deadline.done();
  }
}
