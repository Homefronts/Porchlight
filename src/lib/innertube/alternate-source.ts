import { normalizeName, normalizeTitle } from "@/lib/ai/match";
import type { SourceKind } from "@/lib/store/track-source";
import { fetchSearch } from "./search";
import { rawNext, type YtNode } from "./shared";
import type { ShelfItem } from "./types";

/**
 * Find the other version of a track for the Song/Video chip: the music video
 * of a song, or the song of a music video.
 *
 * 1. YouTube Music's own pairing first. On signed-in requests it wraps a track
 *    that has both versions in a playlistPanelVideoWrapperRenderer with a
 *    `counterpart`: exactly what its own Song/Video chips switch to. A track
 *    that already is the wanted kind (a music video in the queue) is left alone.
 * 2. Otherwise a search for the exact title and artist, keeping only a result
 *    whose title AND artist match, and never a cover, lyric video, live take or
 *    audio upload unless the track itself is one. No confident match means
 *    none, rather than whatever the search ranked first.
 *
 * Also used to play the uncensored recording when the "song" version is the
 * censored one (switching to the video source gets the real audio).
 */
export async function findAlternateVideoId(
  track: { videoId: string; title: string; artists?: { name: string }[] },
  targetKind: SourceKind,
): Promise<string | null> {
  const pair = pairOf(
    await rawNext({ videoId: track.videoId, playlistId: `RDAMVM${track.videoId}`, isAudioOnly: true }).catch(() => null),
    track.videoId,
  );
  if (pair.other) return pair.other;
  // Already a music video (e.g. queued from a video search): it is its own video.
  if (pair.self === targetKind) return targetKind === "video" ? track.videoId : null;

  const artists = (track.artists ?? []).map((a) => a.name);
  const query = `${track.title} ${artists.join(" ")}`.trim();
  if (!query) return null;
  const results = await fetchSearch(query, targetKind === "video" ? "videos" : "songs");
  for (const shelf of results.shelves) {
    for (const item of shelf.items) {
      if (item.id !== track.videoId && matchesTrack(item, track.title, artists)) return item.id;
    }
  }
  return null;
}

function kindOf(row: YtNode | undefined): SourceKind | undefined {
  const t: string | undefined =
    row?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
  if (t === "MUSIC_VIDEO_TYPE_ATV") return "song";
  if (t === "MUSIC_VIDEO_TYPE_OMV" || t === "MUSIC_VIDEO_TYPE_UGC") return "video";
  return undefined;
}

/**
 * From a /next response: what `videoId` itself is (song or video) and, when
 * YouTube Music paired it, the other half of its song/video pair.
 */
export function pairOf(json: YtNode | null, videoId: string): { self?: SourceKind; other?: string } {
  const panel =
    json?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  for (const c of (panel?.contents as YtNode[] | undefined) ?? []) {
    const w = c.playlistPanelVideoWrapperRenderer;
    const a: YtNode | undefined = c.playlistPanelVideoRenderer ?? w?.primaryRenderer?.playlistPanelVideoRenderer;
    const b: YtNode | undefined = w?.counterpart?.[0]?.counterpartRenderer?.playlistPanelVideoRenderer;
    if (a?.videoId === videoId) return { self: kindOf(a), other: b?.videoId };
    if (b?.videoId === videoId) return { self: kindOf(b), other: a?.videoId };
  }
  return {};
}

/** Versions that are a different recording, or not the real video. */
const OTHER_TAKE = /\b(cover|lyrics?|live|karaoke|reaction|remix|instrumental|sped up|slowed|8d|audio)\b/;

/** Is this search result the same song (by the same artist) as the track? */
export function matchesTrack(item: ShelfItem, title: string, artists: string[]): boolean {
  if (item.kind !== "song" && item.kind !== "video") return false;
  const want = normalizeTitle(title);
  const got = normalizeTitle(item.title);
  if (!want || !got.includes(want)) return false;
  // "Artist - Title" uploads put the artist in the title; keep it out of the take check.
  const names = artists.map(normalizeName).filter(Boolean);
  const byArtist = (item.artists ?? []).some((a) => names.includes(normalizeName(a.name))) || names.some((n) => got.includes(n));
  if (!byArtist) return false;
  const extra = names.reduce((s, n) => s.replace(n, " "), got.replace(want, " "));
  // Tags like "(Live)" are dropped by normalizeTitle, so check the raw title too.
  const rawExtra = item.title.toLowerCase().replace(title.toLowerCase(), " ");
  const takeOf = (s: string) => OTHER_TAKE.test(s);
  return !takeOf(extra) && (takeOf(title.toLowerCase()) || !takeOf(rawExtra));
}
