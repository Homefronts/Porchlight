import { useQuery } from "@tanstack/react-query";
import { fetchLibraryAlbums, fetchLibraryPlaylists, libraryPlaylistsQuery } from "@/lib/innertube/library";
import { useDownloadsStore } from "@/lib/downloads";
import { authLoggedInQuery } from "@/lib/store/auth-queries";
import { bare, inAppLibrary, usePinnedPlaylistsStore } from "@/lib/store/pinned-playlists";

/**
 * Whether a playlist or album page is part of the user's library, where
 * AI songs stay visible (greyed and skipped) instead of being hidden.
 * Liked Songs, saved playlists and albums, playlists the user owns
 * (`owned`, from the page's own editable flag) and downloads all count.
 */
export function useInLibrary(kind: "playlist" | "album", id: string, owned = false): boolean {
  const loggedIn = useQuery(authLoggedInQuery);
  const lib = useQuery({
    queryKey: ["library", kind === "playlist" ? "playlists" : "albums"],
    queryFn: kind === "playlist" ? fetchLibraryPlaylists : fetchLibraryAlbums,
    enabled: loggedIn.data === true,
    staleTime: 5 * 60_000,
  });
  const downloaded = useDownloadsStore((s) => !!s.index.collections[bare(id)] || !!s.index.collections[id]);
  const saved = usePinnedPlaylistsStore(
    (s) => kind === "playlist" && !!s.activeAccountId && (s.savedByAccount[s.activeAccountId] ?? []).some((p) => bare(p.id) === bare(id)),
  );
  if (owned || downloaded || saved || bare(id) === "LM") return true;
  // Hold (not hide) until we know: AI rows would vanish, then reappear greyed.
  // A disabled query stays pending, so only wait on it when signed in.
  if (loggedIn.isPending || (loggedIn.data === true && lib.isPending)) return true;
  const want = bare(id);
  return !!lib.data?.some((sec) => sec.items.some((i) => bare(i.id) === want));
}

/**
 * Whether a playlist is in the app's library: added in the app, or listed by
 * YouTube and not removed in the app. Drives Add/Remove from library.
 */
export function usePlaylistInAppLibrary(id: string): boolean {
  const loggedIn = useQuery(authLoggedInQuery);
  const lib = useQuery(libraryPlaylistsQuery(loggedIn.data === true));
  return usePinnedPlaylistsStore((s) => {
    const acct = s.activeAccountId;
    if (!acct) return false;
    return inAppLibrary(id, s.savedByAccount[acct] ?? [], s.removedByAccount[acct] ?? [], (want) =>
      !!lib.data?.some((sec) => sec.items.some((i) => bare(i.id) === want)),
    );
  });
}
