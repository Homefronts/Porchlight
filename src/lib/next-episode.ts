import { infiniteQueryOptions } from "@tanstack/react-query";
import { fetchShowContinuation, fetchShowFirstPage, type Show, type ShowPage } from "@/lib/innertube/podcasts";
import { queryClient } from "@/lib/query-client";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { useEpisodesStore, type EpisodeState } from "@/lib/store/episodes";
import { useShowSortStore } from "@/lib/store/show-sort";

/**
 * The episode after `current` in the order the show is sorted by, skipping
 * played ones. `episodes` is newest first: "newest" walks down the list
 * (older), "oldest" walks up it (newer).
 */
export function pickNextEpisode(
  current: QueueTrack,
  episodes: QueueTrack[],
  order: "newest" | "oldest",
  byId: Record<string, EpisodeState>,
): QueueTrack | null {
  const at = episodes.findIndex((e) => e.videoId === current.videoId);
  if (at < 0) return null;
  const step = order === "newest" ? 1 : -1;
  for (let i = at + step; i >= 0 && i < episodes.length; i += step) {
    if (!byId[episodes[i].videoId]?.played) return episodes[i];
  }
  return null;
}

type ShowPageParam = { token: string; show: Pick<Show, "id" | "title"> } | undefined;

/** A show's episode pages, newest first: shared by the show page and `queueNextEpisode`. */
export const showPagesQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: ["show-pages", id],
    initialPageParam: undefined as ShowPageParam,
    queryFn: ({ pageParam }): Promise<ShowPage & { show?: Show }> =>
      pageParam ? fetchShowContinuation(pageParam.show, pageParam.token) : fetchShowFirstPage(id),
    getNextPageParam: (last, pages): ShowPageParam =>
      last.continuationToken && pages[0].show ? { token: last.continuationToken, show: pages[0].show } : undefined,
  });

/** Append the show's next episode after `current`, if it is still the last queued track. */
export async function queueNextEpisode(current: QueueTrack): Promise<void> {
  const showId = current.episode?.showId;
  if (!showId) return;
  const order = useShowSortStore.getState().orderOf(showId);
  const pick = () => pickNextEpisode(current, episodes, order, useEpisodesStore.getState().byId);
  const { pages } = await queryClient.ensureInfiniteQueryData(showPagesQuery(showId));
  const show = pages[0].show;
  let episodes = pages.flatMap((p) => p.episodes);
  let token = pages[pages.length - 1].continuationToken;
  let next = pick();
  // Page in more only while the next episode could still be further down:
  // in oldest order it sits above the current one, so finding that ends it.
  while (!next && token && show && !(order === "oldest" && episodes.some((e) => e.videoId === current.videoId))) {
    const page = await fetchShowContinuation(show, token);
    if (!page.episodes.length) break;
    episodes = [...episodes, ...page.episodes];
    token = page.continuationToken;
    next = pick();
  }
  const s = usePlaybackStore.getState();
  // Stale guard: the queue moved on while the show was loading.
  if (!next || s.queue[s.index]?.videoId !== current.videoId || s.index < s.queue.length - 1) return;
  s.appendToQueue([next]);
}

/**
 * Where a freshly loaded track starts once its metadata is in: a seek the
 * user made while it loaded, else the saved place (unless it is at the very end).
 */
export function startPosition(resumeAt: number | null, userSeek: number | null, duration: number): number | null {
  if (userSeek !== null) return userSeek;
  return resumeAt !== null && Number.isFinite(duration) && resumeAt < duration - 1 ? resumeAt : null;
}
