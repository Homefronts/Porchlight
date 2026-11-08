import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchLrclibLyrics } from "@/lib/lyrics/lrclib";
import { fetchMusixmatchLyrics } from "@/lib/lyrics/musixmatch";
import { fetchGeniusLyrics } from "@/lib/lyrics/genius";
import { fetchYtMusicLyrics } from "@/lib/lyrics/ytmusic";
import { shouldRetryLyricsQuery } from "@/lib/lyrics/http";
import { cleanTrackTitle, lyricsArtist } from "@/lib/track-meta";
import type { Lyrics } from "@/lib/lyrics/types";
import { fetchKugouLyrics } from "@/lib/lyrics/kugou";
import { fetchNeteaseLyrics } from "@/lib/lyrics/netease";
import { loadLyricsFile } from "@/lib/lyrics/user-files";
import { availabilityOf, pickSource, type Availability } from "@/lib/lyrics/pick";
import {
  DEFAULT_ORDER,
  enabledSources,
  useLyricsSettings,
  type LyricsSource,
} from "@/lib/store/lyrics-settings";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Bumped whenever the query we send changes shape. Lyrics are persisted to
 * IndexedDB for 24h (`query-client.ts:9`, `App.tsx:49`), so without this a
 * user keeps yesterday's answer, looked up with yesterday's broken title
 * and artist, for a day after installing the fix.
 */
const LOOKUP_VERSION = "v4";

/**
 * Fire every enabled lyric query in parallel, plus a derived "best" selection
 * (see `pickSource`: word-timed, then line-timed, then plain, in the user's order).
 * Kugou and NetEase run only when `enabledSources` lists them, i.e. with consent.
 */
export function useLyricsSources(track: QueueTrack | undefined, enabled: boolean) {
  // YTM's display strings are not lookup strings. See track-meta.ts for the
  // measurements; in short, the raw title and the raw subtitle each cost
  // most or all of the LRCLIB result set.
  //
  // Memoised because both player bars call this hook and re-render on every
  // position tick, while the answer only changes when the track does. The
  // work is small either way; this just keeps it off the hot path.
  const artistName = useMemo(() => lyricsArtist(track), [track]);
  const trackTitle = useMemo(
    () => (track ? cleanTrackTitle(track.title) : undefined),
    [track],
  );

  // The real duration, once the audio element knows it. Used only when the
  // browse response had none, which is the case the old code got wrong:
  // with no duration LRCLIB's search picks blind from records that can be
  // minutes apart. Preferring the browse value when present keeps the query
  // key stable, so the common track costs one round rather than a second
  // one when playback resolves.
  const liveDuration = usePlaybackStore((s) => s.duration);
  const duration =
    track?.duration ?? (liveDuration > 0 ? liveDuration : undefined);

  // One automatic retry, and none at all when the provider said we are
  // asking too often.
  //
  // The cap stays at 1 because each provider now has its own 8 s deadline
  // (see http.ts), so attempts are bounded but still add up, and the only
  // time the user waits out a full chain is when every source is failing,
  // which is exactly when there is nothing to show anyway.
  //
  // The rate-limit exemption matters more. These queries run on every track
  // change whether or not the panel is open, and Musixmatch gates at
  // roughly 20 requests per IP per two minutes. Retrying a refusal doubles
  // the pressure on the one provider that is already saying stop, and would
  // turn a brief gate into a lasting one. Those get the Try again button
  // instead, which is a human deciding enough time has passed.
  // Keyed on the videoId alone: no title, no artist, nothing fuzzy. This
  // is the query that structurally cannot come back with another song.
  const order = useLyricsSettings((s) => s.order);
  const off = useLyricsSettings((s) => s.off);
  const consent = useLyricsSettings((s) => s.chineseConsent);
  const songPick = useLyricsSettings((s) =>
    track?.videoId ? s.perSong[track.videoId] : undefined,
  );
  const on = useMemo(
    () => enabledSources({ order, off, chineseConsent: consent }),
    [order, off, consent],
  );
  const isOn = (s: LyricsSource) => enabled && on.includes(s);

  const ytmusic = useQuery({
    queryKey: ["lyrics", "ytmusic", LOOKUP_VERSION, track?.videoId],
    queryFn: ({ signal }) => fetchYtMusicLyrics(track?.videoId, signal),
    enabled: !!track?.videoId && isOn("ytmusic"),
    staleTime: ONE_HOUR,
    retry: shouldRetryLyricsQuery,
  });

  const lrclib = useQuery({
    queryKey: [
      "lyrics",
      "lrclib",
      LOOKUP_VERSION,
      trackTitle,
      artistName,
      track?.album,
      duration,
    ],
    queryFn: ({ signal }) =>
      fetchLrclibLyrics(
        {
          title: trackTitle!,
          artist: artistName,
          album: track?.album,
          duration,
        },
        signal,
      ),
    enabled: !!track && isOn("lrclib"),
    staleTime: ONE_HOUR,
    retry: shouldRetryLyricsQuery,
  });

  const musixmatch = useQuery({
    queryKey: ["lyrics", "musixmatch", LOOKUP_VERSION, trackTitle, artistName],
    queryFn: ({ signal }) =>
      fetchMusixmatchLyrics(
        {
          title: trackTitle!,
          artist: artistName,
        },
        signal,
      ),
    enabled: !!track && isOn("musixmatch"),
    staleTime: ONE_HOUR,
    retry: shouldRetryLyricsQuery,
  });

  const genius = useQuery({
    queryKey: ["lyrics", "genius", LOOKUP_VERSION, trackTitle, artistName],
    queryFn: ({ signal }) =>
      fetchGeniusLyrics(
        {
          title: trackTitle!,
          artist: artistName,
        },
        signal,
      ),
    enabled: !!track && isOn("genius"),
    staleTime: ONE_HOUR,
    retry: shouldRetryLyricsQuery,
  });

  const kugou = useQuery({
    queryKey: ["lyrics", "kugou", LOOKUP_VERSION, trackTitle, artistName, duration],
    queryFn: ({ signal }) =>
      fetchKugouLyrics({ title: trackTitle!, artist: artistName, duration }, signal),
    enabled: !!track && isOn("kugou"),
    staleTime: ONE_HOUR,
    retry: shouldRetryLyricsQuery,
  });

  const netease = useQuery({
    queryKey: ["lyrics", "netease", LOOKUP_VERSION, trackTitle, artistName, duration],
    queryFn: ({ signal }) =>
      fetchNeteaseLyrics({ title: trackTitle!, artist: artistName, duration }, signal),
    enabled: !!track && isOn("netease"),
    staleTime: ONE_HOUR,
    retry: shouldRetryLyricsQuery,
  });

  const file = useQuery({
    queryKey: ["lyrics", "file", track?.videoId],
    queryFn: () => loadLyricsFile(track!.videoId),
    enabled: !!track?.videoId && isOn("file"),
    staleTime: Infinity,
  });

  const queries: Record<LyricsSource, UseQueryResult<Lyrics | null>> = {
    file,
    kugou,
    netease,
    ytmusic,
    lrclib,
    musixmatch,
    genius,
  };

  const avail = {} as Record<LyricsSource, Availability>;
  for (const s of DEFAULT_ORDER) {
    const q = queries[s];
    avail[s] = availabilityOf(q.data, q.isLoading, q.isError, on.includes(s));
  }
  const best = pickSource(on, avail, songPick);

  const isLoading = on.some((s) => queries[s].isLoading);

  // Whether any source failed to *answer*, as opposed to answering "no
  // lyrics". Since providers stopped collapsing failures into null, this is
  // now knowable, and the panel needs it: "we could not reach Genius" and
  // "this track has no lyrics" call for different words and only one of
  // them is worth a retry button.
  const failed = on.filter((s) => queries[s].isError);

  // A refetch of an errored query leaves `isError` true until it settles, so
  // without this the panel looks inert after Try again and invites a second
  // click, which is the request doubling the retry policy above exists to
  // avoid.
  const isRetrying = failed.some((s) => queries[s].isFetching);

  const retryFailed = () => {
    for (const s of failed) void queries[s].refetch();
  };

  return { queries, availability: avail, best, isLoading, failed, isRetrying, retryFailed };
}
