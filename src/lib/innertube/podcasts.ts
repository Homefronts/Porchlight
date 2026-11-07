import type { Thumbnail } from "./types";
import type { QueueTrack } from "@/lib/store/playback";
import {
  collectContinuationItems,
  parseContinuationPage,
  rawBrowse,
  rawBrowseContinuation,
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
  const showTitle = show?.title ?? own?.text;
  if (!showId || !showTitle) return null;
  // Show rows read "636K views • 23h ago", new-episode rows just "23h ago".
  const publishedText = (row.subtitle?.runs ?? [])
    .map((r: YtNode) => String(r.text ?? "").trim())
    .filter((t: string) => t && t !== "•" && !/views?$/i.test(t))
    .pop();
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
    episode: { showId, showTitle, publishedText },
  };
}

function mapEpisodes(rows: YtNode[], show?: Pick<Show, "id" | "title">): QueueTrack[] {
  return rows
    .map((r) => mapEpisode(r.musicMultiRowListItemRenderer ?? {}, show))
    .filter((t): t is QueueTrack => !!t);
}

/** The episode shelf of a show / auto-playlist page. */
function episodeShelf(json: YtNode): YtNode | undefined {
  return json?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents
    ?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer;
}

/** The episode shelf plus every continuation page. */
async function readEpisodes(json: YtNode): Promise<QueueTrack[]> {
  const shelf = episodeShelf(json);
  return mapEpisodes([
    ...(shelf?.contents ?? []),
    ...(await collectContinuationItems(readPagingToken(shelf))),
  ]);
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

export type ShowPage = { episodes: QueueTrack[]; continuationToken?: string };

/** A show and its first page of episodes, newest first; `fetchShowContinuation` pages in the rest. */
export async function fetchShowFirstPage(
  id: string,
): Promise<ShowPage & { show: Show }> {
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
  const shelf = episodeShelf(json);
  return {
    show,
    episodes: mapEpisodes(shelf?.contents ?? [], show),
    continuationToken: readPagingToken(shelf),
  };
}

/** The next page of a show's episodes. */
export async function fetchShowContinuation(
  show: Pick<Show, "id" | "title">,
  token: string,
): Promise<ShowPage> {
  const { items, token: next } = parseContinuationPage(await rawBrowseContinuation(token));
  // A token that hands itself back would page forever.
  return { episodes: mapEpisodes(items, show), continuationToken: next === token ? undefined : next };
}

/** The "New episodes" auto playlist. */
export async function fetchNewEpisodes(): Promise<QueueTrack[]> {
  return readEpisodes(await rawBrowse("VLRDPN"));
}
