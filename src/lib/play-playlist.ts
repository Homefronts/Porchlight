import type { QueryClient } from "@tanstack/react-query";
import {
  fetchPlaylistContinuation,
  fetchPlaylistFirstPage,
  type PlaylistFirstPage,
} from "@/lib/innertube/playlist";
import { usePlaybackStore } from "@/lib/store/playback";

/** Pages streamed in after the first; ~100 tracks each. */
const MAX_TAIL_PAGES = 20;

/** Bumped per call, so only the latest call's tail keeps streaming. */
let current = 0;

/**
 * Start a playlist from its first track (or `start`, within the first
 * page) without opening its page. The
 * first page plays at once; the rest streams into the queue behind it,
 * page by page, for as long as that playlist is still what is queued.
 * Starting anything else in the meantime stops the stream, so a stale
 * tail never lands on top of the new queue.
 *
 * `shown` is a first page already on screen: it plays as is, so `start`
 * lands on the track the user clicked even if a refetch would reorder it.
 *
 * Resolves once playback has started (or with `false` when the
 * playlist is empty); the tail keeps loading after that.
 */
export async function playPlaylistNow(
  id: string,
  qc: QueryClient,
  start = 0,
  shown?: PlaylistFirstPage,
): Promise<boolean> {
  const gen = ++current;
  const first =
    shown ??
    (await qc.fetchQuery<PlaylistFirstPage>({
      queryKey: ["playlist-first", id],
      queryFn: () => fetchPlaylistFirstPage(id),
      staleTime: 5 * 60_000,
    }));
  // A newer play took over while this one loaded; it isn't empty, just superseded.
  if (gen !== current) return true;
  if (first.tracks.length === 0) return false;

  const store = usePlaybackStore.getState();
  store.playShelfItems(first.tracks, start);
  store.setShuffle(false);
  const head = usePlaybackStore.getState().queue[0]?.videoId;

  void (async () => {
    let token = first.continuationToken;
    for (let page = 0; token && page < MAX_TAIL_PAGES; page++) {
      let next;
      try {
        next = await fetchPlaylistContinuation(token);
      } catch {
        return;
      }
      if (gen !== current || usePlaybackStore.getState().queue[0]?.videoId !== head) return;
      if (next.tracks.length > 0) {
        usePlaybackStore.getState().appendToQueue(next.tracks);
      }
      token = next.continuationToken;
    }
  })();

  return true;
}
