import { classifyArtists, isLookalike, type AiIndex, type AiOverrides } from "./match";

type Filterable = {
  kind?: string;
  id?: string;
  title?: string;
  artists?: { id?: string; name: string }[];
};

/**
 * Drops confirmed AI (songs, albums by AI artists, and AI artist cards)
 * and copycat channels using an AI act's name, when `hiding`. Other "AI?"
 * rows stay. Returns the same array when nothing is hidden, so memoised
 * lists stay stable.
 */
export function filterAiItems<T extends Filterable>(
  items: T[],
  idx: AiIndex,
  overrides: AiOverrides,
  hiding: boolean,
): T[] {
  if (!hiding) return items;
  const out = items.filter((i) => {
    const artists = i.kind === "artist" && i.id ? [{ id: i.id, name: i.title ?? "" }] : i.artists;
    return classifyArtists(artists, idx, overrides) !== "ai" && !isLookalike(artists, idx, overrides);
  });
  return out.length === items.length ? items : out;
}

const MIN_AFTER_FILTER = 10;

/**
 * Filters a mix page and, while fewer than 10 songs survive, follows its
 * continuation, at most `max` extra requests, so an AI-heavy mix doesn't
 * run dry without looping forever on an all-AI one.
 */
export async function refillFiltered<T>(
  first: T[],
  token: string | undefined,
  fetchMore: (t: string) => Promise<{ tracks: T[]; continuation?: string }>,
  keep: (t: T) => boolean,
  max = 3,
): Promise<{ tracks: T[]; continuation?: string }> {
  const tracks = first.filter(keep);
  let continuation = token;
  for (let i = 0; i < max && continuation && tracks.length < MIN_AFTER_FILTER; i++) {
    let page;
    try {
      page = await fetchMore(continuation);
    } catch {
      break; // keep what survived; the kept token lets the next load retry
    }
    tracks.push(...page.tracks.filter(keep));
    continuation = page.continuation;
  }
  return { tracks, continuation };
}
