import { fetchShow } from "@/lib/innertube/podcasts";
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

/** Append the show's next episode after `current`, if it is still the last queued track. */
export async function queueNextEpisode(current: QueueTrack): Promise<void> {
  const showId = current.episode?.showId;
  if (!showId) return;
  const { episodes } = await fetchShow(showId);
  const next = pickNextEpisode(current, episodes, useShowSortStore.getState().orderOf(showId), useEpisodesStore.getState().byId);
  const s = usePlaybackStore.getState();
  // Stale guard: the queue moved on while the show was loading.
  if (!next || s.queue[s.index]?.videoId !== current.videoId || s.index < s.queue.length - 1) return;
  s.appendToQueue([next]);
}
