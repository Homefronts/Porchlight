# Offline downloads — design

Date: 2026-10-19 · Status: draft for approval

## Intent

Today YTubic is useless the moment the internet drops. The user wants
Spotify-style downloads: save playlists, albums, Liked Songs and single
songs to disk, and when the connection goes away the app keeps working
normally, with everything downloaded still browsable and playable.

## Goals

1. **Download toggle on every collection page**: playlist, album and
   Liked Songs headers get a Spotify-like download toggle next to
   Play / Shuffle / Share.
2. **Single songs**: "Download" / "Remove download" in the track context
   menu (right-click / ⋮), wherever that menu appears.
3. **Toggle on**: downloads every track in the collection. While the
   toggle stays on, tracks added to that collection later are downloaded
   automatically the next time the app syncs it (see Sync).
4. **Toggle off**: deletes that collection's downloaded files and frees the
   space. A track also needed by another downloaded collection, or
   downloaded on its own, stays on disk until nothing needs it.
5. **Downloads page**: a new **Downloads** row in the sidebar's Browse
   group (after Library). It lists downloaded playlists, albums, Liked
   Songs and single songs, and opens them without any network.
6. **Offline = nothing breaks**: with no connection the app opens and runs
   normally. Downloaded music plays. Network-only things (search, Home,
   lyrics not already cached) show their usual failure states instead of
   crashing or hanging.
7. **Downloaded tracks play from disk even when online**: faster, and no
   data used.
8. **Progress**: the toggle shows progress while a collection downloads,
   and the Downloads page shows per-collection state.

## Non-goals (for now)

- Choosing download quality or folder. Default is the best audio
  YouTube offers, stored in the app data folder. A setting can come later.
- Downloading in the floating player window UI.
- Exporting files for use outside YTubic (they're an app-private store).
- Artist-page or search-result "download all".

## Anti-goals (a failure even if it technically works)

- Downloads get wiped by the existing cache cleanup, a "Clear cache"
  click, or the OS clearing its cache folder.
- Offline launch shows the Premium upsell gate or a spinner forever
  instead of playing downloads.
- Turning off one playlist deletes a song another download still needs.
- Downloading blocks or slows normal playback.

## Constraints and existing code (from recon)

- **Playback is Premium-only.** `src/lib/audio-engine.ts` (around line
  494) parks playback and opens the Premium gate unless
  `usePremiumStore.status === "premium"`. Downloads are Premium-only to
  match. **Offline, the Premium probe can't run.** The last confirmed
  Premium status must be remembered so downloaded tracks still play
  offline. Gate only *downloaded* tracks on the remembered status; online
  streaming keeps today's live check. **The remembered status is trusted
  for 30 days** after the last successful Premium check (user's decision,
  Spotify's rule). After that, downloads stay on disk but won't play, and
  the gate explains "Connect to the internet to keep using downloads".
  The next successful check unlocks them. If that check says the account
  is no longer Premium, the downloads stay locked but are not deleted.
- **Audio is served by a localhost stream server in Rust**
  (`src-tauri/src/lib.rs`, `stream_handler` around 3722,
  `start_stream_server` around 3963). The frontend builds URLs with
  `streamUrlFor` (`src/lib/stream.ts:46`). The handler already downloads
  whole files with yt-dlp (`spawn_downloader` around 3547, format
  `bestaudio[ext=webm]…`) into `<cacheRoot>/stream/<id>.webm`. Downloads
  should reuse this downloader. The stream handler should serve a
  downloaded file first when one exists, so no frontend URL changes and
  no new Tauri fs/asset permissions are needed.
- **Downloads must not live in the cache dir.** `<cacheRoot>` can be the
  OS cache or a user-picked folder. `src/lib/cache-cleanup.ts:51-63`
  sweeps cached tracks not in the library, and the Storage tab's Clear
  actions delete cache entries. Store downloads under
  `app_data_dir()/downloads/` (yt-dlp already lives in app data).
- **Covers**: cached in `<cacheRoot>/covers`, so the same wipe risk
  applies. Downloaded collections and tracks keep their own cover copies
  in the downloads dir.
- **Page data offline**: React Query persists some pages to IndexedDB for
  7 days, capped at 500 KB per query (`src/lib/query-client.ts`), so large
  playlists are not persisted. The Downloads page and downloaded
  collection views must render from the downloads index alone, never
  from React Query.
- **No offline detection exists** in the frontend today. Rust notices
  offline only during session refresh (`session-status.ts` `offline`
  reason).
- Playlist pages load tracks in pages (`fetchPlaylistFirstPage` /
  `fetchPlaylistContinuation`). A collection download needs the full
  list: `fetchPlaylist` (`src/lib/innertube/playlist.ts:437`) loads all of
  it. Liked Songs is the `LM` / `VLLM` playlist.
- Collection headers render through `EntityHeader`
  (`src/components/shared/entity-header.tsx` →
  `src/components/layout/entity-page-header.tsx`, `actions` slot). Liked
  Songs currently passes `actions = null`
  (`src/routes/playlist.$id.tsx:88,332`) and needs its download toggle
  added.

## Decided behaviour

- **Downloads index** (source of truth, in app data, written by Rust):
  - collections: id, kind (playlist / album / liked), title, cover, ordered
    track ids, `autoSync` (on while the toggle is on), last synced
  - tracks: videoId, the `QueueTrack` metadata needed to show and play
    it, file path, size, and which collections and/or "single" reference
    it
- **Sync** = re-fetch a downloaded collection's full track list, download
  new tracks, update the stored order. Removing a track from the playlist
  on YouTube's side also removes it from the download (deleting the file
  if nothing else references it). Sync runs at app start (when online),
  when the user opens that collection's page, and every few hours while
  the app runs.
- **Download queue**: one or two tracks at a time in the background,
  retried on failure, resumed after an app restart. Playback streaming
  always takes priority over downloads.
- **Offline browsing**: the Downloads page and a downloaded collection's
  view work with no network. Navigating to a non-downloaded page offline
  shows the normal error state.
- **Playing a downloaded collection** offline queues only its downloaded
  tracks. Auto-radio, radio mixes and continuations quietly do nothing
  offline.

## Builder calls (made by the designer, not the user — revisit freely)

- **Sync safety**: deletions happen only after a fully successful fetch of
  the whole track list. An error, a partial fetch, an empty result or a
  signed-out session counts as "sync failed, change nothing". A track
  that's merely unavailable or region-blocked but still listed is kept.
- **Albums** get their full track list from `fetchAlbum`
  (`src/lib/innertube/album.ts:23`), not `fetchPlaylist`.
- **Tracks that won't download** (age-restricted, removed, yt-dlp keeps
  failing): after retries the track is marked failed and skipped. The
  collection counts as downloaded with "N of M songs", and failed tracks
  retry on the next sync. **Each failed song shows a yellow exclamation
  icon** next to it in track lists (collection pages and the Downloads
  page), with a tooltip saying why it failed (user's decision).
- **Who does what**: the frontend drives sync. It fetches track lists with
  the existing innertube code and hands them to Rust. Rust owns the index,
  the download queue and the files. The queue runs while the app process
  runs (tray included) and resumes on the next launch.
- **One account only** (user's decision): the app is built for a single
  account, so the downloads index is global and not tied to accounts.
  Signing out doesn't delete downloads. No multi-account support.
- **Already-cached tracks**: if `stream/<id>.webm` exists, copy it into
  downloads instead of downloading again.

## Left to the builder

- The exact on-disk layout, index format (JSON vs SQLite) and Rust/TS
  command split.
- How offline is detected (failed requests, `navigator.onLine`, the Rust
  session status, or a mix), as long as goal 6 holds.
- Toggle visual design (follow the app's existing header button style)
  and the Downloads page layout (reuse the Library page's grid and lists).
- Whether the Storage tab shows a "Downloads: N songs, X MB" line with
  "Remove all downloads" (nice to have, small).
- Concurrency number, retry policy, sync interval.

## Future feature (noted, not in this build)

- **Compress downloads**: an option to shrink the downloads folder, either
  per collection or for all of them. YouTube's audio is already compressed
  (Opus, roughly 130–160 kbps), so a lossless squeeze gains almost nothing.
  The real saving is re-encoding to a lower bitrate (Opus at around
  64–96 kbps is about half the size, still fine for most listening), most
  likely with an ffmpeg step. Design it when downloads have shipped.
