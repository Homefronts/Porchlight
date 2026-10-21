import { useQuery } from "@tanstack/react-query";
import { fetchLibraryAlbums, fetchLibraryPlaylists } from "@/lib/innertube/library";
import { useDownloadsStore } from "@/lib/downloads";
import { authLoggedInQuery } from "@/lib/store/auth-queries";

const bare = (id: string) => (id.startsWith("VL") ? id.slice(2) : id);

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
  if (owned || downloaded || bare(id) === "LM") return true;
  // Hold (not hide) until we know: AI rows would vanish, then reappear greyed.
  // A disabled query stays pending, so only wait on it when signed in.
  if (loggedIn.isPending || (loggedIn.data === true && lib.isPending)) return true;
  const want = bare(id);
  return !!lib.data?.some((sec) => sec.items.some((i) => bare(i.id) === want));
}
