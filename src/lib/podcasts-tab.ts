import { episodeStatus, type EpisodeState } from "@/lib/store/episodes";
import type { Show } from "@/lib/innertube/podcasts";
import type { QueueTrack } from "@/lib/store/playback";

/** Library shows plus app-only follows, one entry per id. */
export function mergeShows(library: Show[], local: Show[]): Show[] {
  const seen = new Set<string>();
  return [...library, ...local].filter((s) => !seen.has(s.id) && !!seen.add(s.id));
}

/** Ids of shows with an episode still "new" (the dot). */
export function showsWithNew(episodes: QueueTrack[], byId: Record<string, EpisodeState>): Set<string> {
  const out = new Set<string>();
  for (const e of episodes) if (e.episode && episodeStatus(byId[e.videoId]) === "new") out.add(e.episode.showId);
  return out;
}

/** The new-episodes feed arrives newest first. */
export function sortNewEpisodes(episodes: QueueTrack[], order: "newest" | "oldest"): QueueTrack[] {
  return order === "newest" ? episodes : [...episodes].reverse();
}
