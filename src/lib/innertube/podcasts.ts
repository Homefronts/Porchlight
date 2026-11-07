import type { Thumbnail } from "./types";
import type { QueueTrack } from "@/lib/store/playback";
import {
  collectContinuationItems,
  rawBrowse,
  readPagingToken,
  readRuns,
  readThumbnails,
  SHOW_PREFIX,
  showIdFromBrowseId,
  type YtNode,
} from "./shared";

export type Show = {
  /** The show's podcast playlistId (browseId without the `MPSP` prefix). */
  id: string;
  title: string;
  author?: string;
  thumbnails: Thumbnail[];
};

/** "2 hr 18 min" / "48 min" / "45 sec" → seconds; undefined when nothing matched. */
function parseSpokenDuration(text: string): number | undefined {
  const n = (unit: string) =>
    Number(new RegExp(`(\\d+)\\s*${unit}`).exec(text)?.[1] ?? 0);
  const secs = n("hr") * 3600 + n("min") * 60 + n("sec");
  return secs > 0 ? secs : undefined;
}

/** One `musicMultiRowListItemRenderer` row → an episode; `show` fills in when the row doesn't name its own. */
function mapEpisode(
  row: YtNode,
  show?: Pick<Show, "id" | "title">,
): QueueTrack | null {
  const videoId: string | undefined = row.onTap?.watchEndpoint?.videoId;
  const title = readRuns(row.title);
  if (!videoId || !title) return null;
  const own = row.secondTitle?.runs?.[0];
  const ownId: string | undefined =
    own?.navigationEndpoint?.browseEndpoint?.browseId;
  const showId = ownId?.startsWith(SHOW_PREFIX)
    ? showIdFromBrowseId(ownId)
    : show?.id;
  const showTitle = own?.text ?? show?.title;
  if (!showId || !showTitle) return null;
  return {
    videoId,
    title,
    thumbnails: readThumbnails(
      row.thumbnail?.musicThumbnailRenderer?.thumbnail,
    ),
    duration: parseSpokenDuration(
      readRuns(
        row.playbackProgress?.musicPlaybackProgressRenderer?.durationText,
      ),
    ),
    episode: { showId, showTitle },
  };
}

/** The episode shelf of a show / auto-playlist page, plus every continuation page. */
async function readEpisodes(
  json: YtNode,
  show?: Pick<Show, "id" | "title">,
): Promise<QueueTrack[]> {
  const shelf: YtNode | undefined =
    json?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents
      ?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer;
  const rows: YtNode[] = [
    ...(shelf?.contents ?? []),
    ...(await collectContinuationItems(readPagingToken(shelf))),
  ];
  return rows
    .map((r) => mapEpisode(r.musicMultiRowListItemRenderer ?? {}, show))
    .filter((t): t is QueueTrack => !!t);
}

/** Shows the user follows. */
export async function fetchLibraryShows(): Promise<Show[]> {
  const json = await rawBrowse("FEmusic_library_non_music_audio_list");
  const sections: YtNode[] =
    json?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
      ?.content?.sectionListRenderer?.contents ?? [];
  const grid: YtNode | undefined = sections.find(
    (s) => s.gridRenderer,
  )?.gridRenderer;
  const rows: YtNode[] = [
    ...(grid?.items ?? []),
    ...(await collectContinuationItems(readPagingToken(grid))),
  ];
  const out: Show[] = [];
  for (const r of rows) {
    const item = r.musicTwoRowItemRenderer;
    const browseId: string | undefined =
      item?.navigationEndpoint?.browseEndpoint?.browseId;
    // The grid also holds "Add podcast", "New Episodes" and "Episodes for Later" tiles.
    if (!browseId?.startsWith(SHOW_PREFIX)) continue;
    out.push({
      id: showIdFromBrowseId(browseId),
      title: readRuns(item.title),
      author: readRuns(item.subtitle) || undefined,
      thumbnails: readThumbnails(
        item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail,
      ),
    });
  }
  return out;
}

/** A show and all its episodes, newest first. */
export async function fetchShow(
  id: string,
): Promise<{ show: Show; episodes: QueueTrack[] }> {
  const json = await rawBrowse(SHOW_PREFIX + id);
  const header: YtNode | undefined =
    json?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
      ?.content?.sectionListRenderer?.contents?.[0]
      ?.musicResponsiveHeaderRenderer;
  const show: Show = {
    id,
    title: readRuns(header?.title),
    author: readRuns(header?.straplineTextOne) || undefined,
    thumbnails: readThumbnails(
      header?.thumbnail?.musicThumbnailRenderer?.thumbnail,
    ),
  };
  return { show, episodes: await readEpisodes(json, show) };
}

/** The "New episodes" auto playlist. */
export async function fetchNewEpisodes(): Promise<QueueTrack[]> {
  return readEpisodes(await rawBrowse("VLRDPN"));
}
