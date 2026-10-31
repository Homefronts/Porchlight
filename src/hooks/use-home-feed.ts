import { useInfiniteQuery } from "@tanstack/react-query";
import { HOME_KEY, fetchHomeFeedPage } from "@/lib/innertube/home";
import { arrangeTitles, useHomeSectionsStore } from "@/lib/store/home-sections";

/**
 * The Home feed as Home shows it. Home and Index's shelf page both read
 * it, so `/shelf/$title` finds the shelf the contents listed.
 */
export function useHomeFeed() {
  const query = useInfiniteQuery({
    queryKey: HOME_KEY,
    queryFn: ({ pageParam }) => fetchHomeFeedPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const loaded = query.data?.pages.flatMap((p) => p.shelves) ?? [];

  // The user's arrangement: their order first, then anything new the
  // feed sent, minus what they switched off. Title is the identity
  // (see home-sections.ts), so two same-titled shelves keep their
  // relative feed order under one slot.
  const order = useHomeSectionsStore((s) => s.order);
  const hidden = useHomeSectionsStore((s) => s.hidden);
  const loadedTitles = loaded.map((s) => s.title);
  const titles = arrangeTitles(loadedTitles, order);
  const rank = new Map(titles.map((t, i) => [t, i]));
  const shelves = loaded
    .filter((s) => !hidden.includes(s.title))
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        (rank.get(a.s.title) ?? 0) - (rank.get(b.s.title) ?? 0) || a.i - b.i,
    )
    .map(({ s }) => s);

  return { query, loadedTitles, shelves };
}
