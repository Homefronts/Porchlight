import type { Lyrics } from "@/lib/lyrics/types";
import { decodeKRC, parseKRC } from "@/lib/lyrics/parse-krc";
import { selectBest } from "@/lib/lyrics/score";
import { createDeadline, lyricsFetch, throwForStatus } from "@/lib/lyrics/http";
import { enabledSources, useLyricsSettings } from "@/lib/store/lyrics-settings";

const KUGOU_BASE = "https://lyrics.kugou.com";
// Generic UA only: no cookies, no account data ever go to this host.
const HEADERS = { "User-Agent": "Mozilla/5.0" };

type Candidate = { song?: string; singer?: string; duration?: number; id?: string; accesskey?: string };

export async function fetchKugouLyrics(
  p: { title: string; artist?: string; duration?: number },
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  if (!enabledSources(useLyricsSettings.getState()).includes("kugou")) throw new Error("consent");
  if (!p.title) return null;

  const deadline = createDeadline(signal);
  try {
    const search = new URL(`${KUGOU_BASE}/search`);
    search.search = new URLSearchParams({
      ver: "1",
      man: "yes",
      client: "pc",
      keyword: p.artist ? `${p.artist} - ${p.title}` : p.title,
      duration: p.duration ? String(Math.round(p.duration * 1000)) : "",
    }).toString();
    const sr = await lyricsFetch(search.toString(), deadline, HEADERS);
    if (!sr.ok) throwForStatus(sr.status, "Kugou search");
    const cands = ((await sr.json()) as { candidates?: Candidate[] }).candidates ?? [];

    const best = selectBest(
      { title: p.title, artist: p.artist, durationSec: p.duration },
      cands.map((c) => ({
        ...c,
        trackName: c.song,
        artistName: c.singer,
        duration: typeof c.duration === "number" ? c.duration / 1000 : undefined,
      })),
      { bodyUnknown: true },
    );
    if (!best?.record.id || !best.record.accesskey) return null;

    const dl = new URL(`${KUGOU_BASE}/download`);
    dl.search = new URLSearchParams({
      ver: "1",
      client: "pc",
      id: best.record.id,
      accesskey: best.record.accesskey,
      fmt: "krc",
      charset: "utf8",
    }).toString();
    const dr = await lyricsFetch(dl.toString(), deadline, HEADERS);
    if (!dr.ok) throwForStatus(dr.status, "Kugou download");
    const content = ((await dr.json()) as { content?: string }).content;
    if (!content) return null;

    const { lines, romanByLine } = parseKRC(await decodeKRC(content));
    // Kugou opens with a "<title> - <artist>" header line; drop it.
    const t = p.title.toLowerCase();
    if (lines[0] && lines[0].text.includes(" - ") && lines[0].text.toLowerCase().includes(t)) {
      lines.shift();
      romanByLine.shift();
    }
    lines.forEach((l, i) => {
      if (romanByLine[i]) l.roman = romanByLine[i]!;
    });
    return lines.length ? { kind: "timed", lines, source: "kugou" } : null;
  } finally {
    deadline.done();
  }
}
