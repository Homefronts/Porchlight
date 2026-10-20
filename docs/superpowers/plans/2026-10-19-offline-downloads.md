# Offline Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spotify-style downloads (playlists, albums, Liked Songs, single songs) that play from disk and keep working with no internet.

**Architecture:** A new Rust module owns a JSON downloads index, a background yt-dlp download queue and the files under `app_data_dir()/downloads/`. The existing localhost stream server serves a downloaded file before trying the cache or yt-dlp, so playback URLs don't change. The frontend drives sync (fetches track lists with existing innertube code and hands them to Rust), mirrors the index into a zustand store via a Tauri event, and adds the UI: header toggle, context-menu items, row status icons, and a Downloads page.

**Tech Stack:** Tauri 2, Rust (tokio, axum, serde_json), React 19 + TS, zustand, TanStack Router (file routes, generated `routeTree.gen.ts`), Tabler icons, vitest (`src/**/*.test.ts`, node env), `cargo test`.

**Spec:** `docs/superpowers/specs/2026-10-19-offline-downloads-design.md`

## Global Constraints

- Downloads live in `app_data_dir()/downloads/`, **never** under the cache root. The cache sweep (`src/lib/cache-cleanup.ts`) and Storage-tab Clear actions must not touch them.
- Layout: `downloads/index.json`, `downloads/tracks/<videoId>.webm`, `downloads/covers/<url_to_filename(url)>`.
- yt-dlp format and flags are identical to `spawn_downloader` (`src-tauri/src/lib.rs` ~3563): extract them to one shared `const YTDLP_AUDIO_ARGS: &[&str]`; reject outputs under `MIN_AUDIO_BYTES` (32 KB).
- One account only. The index is global, not keyed by account, and signing out deletes nothing.
- Downloads are Premium-only, like playback. A remembered Premium status is trusted **30 days** after the last successful check. After that, downloaded tracks don't play and the gate says "Connect to the internet to keep using downloads". Nothing is ever deleted for lapsed Premium.
- Toggling off deletes files nothing else references. Ref keys are collection ids plus the literal `"single"`.
- Sync deletes only after a fully successful full-list fetch. A thrown error, an empty list or a signed-out Liked Songs fetch means "change nothing".
- Failed tracks: after 3 attempts the state is `failed` with a reason, and they retry on the next sync. Rows show a **yellow exclamation icon** (`IconAlertTriangleFilled`, `text-yellow-500`) with the reason as a tooltip.
- Download concurrency is 2. Sync runs at app start (if online), when a downloaded collection's page opens, and every 6 h.
- Rust commands: `downloads_index`, `downloads_set_collection`, `downloads_remove_collection`, `downloads_add_track`, `downloads_remove_track`. Event: `downloads-changed` (payload: full index, throttled to ≤ 2/s).

## Review Focus

1. **Playlist fetch partially fails mid-sync** (continuation 500s). Expected: nothing deleted. `fetchPlaylist` currently swallows continuation errors (playlist.ts:446), so the sync uses a strict mode. Pinned by Task 4's `strict` test.
2. **Same song in two downloaded playlists, one toggled off.** Expected: the file stays. Pinned in Task 1 `shared_track_survives_one_removal`.
3. **App killed mid-download.** Expected: on relaunch, `pending` tracks resume and no `.part` debris counts as done. Pinned in Task 2 `stale_part_files_are_not_done`.
4. **Offline launch with a valid 30-day grant.** Expected: no Premium upsell when playing a downloaded track, and network-only pages show their normal error state. Pinned in Task 5 `downloadedPlaybackAllowed` tests plus the Task 8 manual offline check.
5. **Malicious or odd ids reaching file paths** (`..`, slashes). Expected: rejected. Pinned in Task 1 `rejects_bad_video_ids` (reuse `sanitize_video_id`).

---

### Task 1: Rust downloads index (pure logic)

**Files:**
- Create: `src-tauri/src/downloads.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod downloads;`, make `sanitize_video_id` and `url_to_filename` `pub(crate)`)

**Interfaces:**
- Produces (all `#[serde(rename_all = "camelCase")]`):
  - `enum TrackState { Pending, Done, Failed }` (serialized lowercase)
  - `struct DlTrack { video_id: String, meta: serde_json::Value, cover_url: Option<String>, cover_file: Option<String>, state: TrackState, error: Option<String>, attempts: u8, size: u64, refs: BTreeSet<String> }`
  - `struct DlCollection { id: String, kind: String /* "playlist"|"album"|"liked" */, title: String, subtitle: Option<String>, cover_url: Option<String>, cover_file: Option<String>, track_ids: Vec<String>, synced_at: u64 }`
  - `struct Index { version: u32, collections: BTreeMap<String, DlCollection>, tracks: BTreeMap<String, DlTrack> }` (`Default`, version 1)
  - `struct TrackInput { video_id: String, meta: serde_json::Value, cover_url: Option<String> }`
  - `struct CollectionInput { id: String, kind: String, title: String, subtitle: Option<String>, cover_url: Option<String>, tracks: Vec<TrackInput> }`
  - `impl Index`: `apply_collection(&mut self, c: CollectionInput, now: u64) -> Result<Vec<String>, String>`, `remove_collection(&mut self, id: &str) -> Vec<String>`, `add_single(&mut self, t: TrackInput) -> Result<(), String>`, `remove_single(&mut self, video_id: &str) -> Vec<String>`. Each returned `Vec<String>` lists video ids whose last ref went away: the caller deletes their files.
  - `fn load_index(path: &Path) -> Index` (missing or corrupt → `Index::default()`, and a corrupt file is renamed to `index.json.bad`), `fn save_index(path: &Path, idx: &Index) -> std::io::Result<()>` (write `.tmp`, then rename).

- [ ] **Step 1: Write failing tests** in a `#[cfg(test)] mod tests` in `downloads.rs`:
  - `apply_adds_pending_tracks_with_ref`: apply collection `P1` with tracks a, b → both `Pending`, `refs == {"P1"}`, `track_ids == ["a","b"]`.
  - `shared_track_survives_one_removal`: `P1` = [a, b], `P2` = [b] → `remove_collection("P1")` returns `["a"]`, and b is still present with refs `{"P2"}`.
  - `resync_drops_removed_tracks`: apply `P1` [a, b] then [b, c] → returns `["a"]`, and c is `Pending`.
  - `resync_retries_failed`: a track `Failed` with `attempts: 3` → re-apply → `Pending`, `attempts == 0`.
  - `single_and_collection_share_file`: `add_single(a)` plus `P1` = [a] → `remove_single("a")` returns `[]`, then `remove_collection("P1")` returns `["a"]`.
  - `rejects_bad_video_ids`: `apply_collection` with video id `"../x"` → `Err`, and the index is unchanged.
  - `save_then_load_roundtrip` (tempdir under `std::env::temp_dir()`), plus `corrupt_index_loads_default`.
- [ ] **Step 2:** `cd src-tauri && cargo test downloads::` → FAIL (does not compile / missing items).
- [ ] **Step 3:** Implement the types and methods above. `apply_collection` validates every id with `sanitize_video_id` before mutating anything.
- [ ] **Step 4:** `cargo test downloads::` → all PASS.
- [ ] **Step 5:** Commit: `feat(downloads): index model with ref-counted tracks`.

### Task 2: Rust download worker, commands, serving

**Files:**
- Modify: `src-tauri/src/downloads.rs`, `src-tauri/src/lib.rs` (shared yt-dlp args, `StreamServer.downloads_dir`, `stream_handler`, `cover_serve_handler`, setup, `generate_handler!`)

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `struct DownloadsState { inner: Arc<tokio::sync::Mutex<Index>>, dir: PathBuf, wake: Arc<Notify> }`, managed via `app.manage`.
  - `fn init(app: &AppHandle, ytdlp_bin: PathBuf, stream_cache_dir: PathBuf)`: loads the index, deletes `tracks/*.part`, resets any `Done` track whose file is missing to `Pending`, then spawns 2 worker tasks.
  - Commands: `downloads_index() -> Index`, `downloads_set_collection(input: CollectionInput)`, `downloads_remove_collection(id: String)`, `downloads_add_track(track: TrackInput)`, `downloads_remove_track(video_id: String)`. Each mutating command saves the index, deletes returned files (track file plus its cover if no other entry uses that cover), emits `downloads-changed`, and wakes the workers.
  - `pub(crate) fn downloaded_track_path(dir: &Path, video_id: &str) -> Option<PathBuf>` (Some only if the file exists).
- Worker per track:
  1. If `<stream_cache_dir>/<id>.webm` exists and is ≥ 32 KB, copy it in.
  2. Otherwise run yt-dlp with `YTDLP_AUDIO_ARGS` + `-o <tracks/<id>.part>` + the watch URL, using the `CREATE_NO_WINDOW` flag on Windows. Rename the result to `.webm` if it's ≥ 32 KB.
  3. On failure, `attempts += 1`. At 3 attempts the state becomes `Failed`, with `error` set to the last stderr line (truncated to 200 chars), or `"download too small"`.
  4. Also download the `cover_url` of tracks and collections into `covers/` with `check_cover_url` + `fetch_cover_bytes`. A cover failure doesn't fail the track.
  5. Emit `downloads-changed` throttled to ≤ 2/s.
- `stream_handler`: right after `sanitize_video_id`, if `downloaded_track_path(...)` is Some, serve it with the existing `sniff_audio_mime` + `ServeFile` path, ignoring `ephemeral`.
- `cover_serve_handler`: when the file isn't in `cover_dir`, fall back to `downloads/covers/<filename>`.

- [ ] **Step 1: Write failing tests:**
  - `stale_part_files_are_not_done`: tempdir with `tracks/a.part` and an index where a is `Done` but has no `.webm` → after `init`-style recovery (factor out `fn recover(dir, &mut Index)`), the `.part` is gone and a is `Pending`.
  - `stream_serves_downloaded_file_first`: Router with only `/stream/:video_id`, and a `StreamServer` whose `downloads_dir/tracks/abc.webm` holds ≥ 32 KB of the webm magic `1A 45 DF A3` → GET returns 200, `content-type: audio/webm`, and never spawns yt-dlp (`ytdlp_bin` points at a nonexistent path).
- [ ] **Step 2:** `cargo test` → the new tests FAIL.
- [ ] **Step 3:** Implement the worker, recovery, commands and handler changes. Register the commands in `generate_handler!` and call `downloads::init` in setup next to `start_stream_server` (`downloads_dir = app_data_dir()/downloads`).
- [ ] **Step 4:** `cargo test` → all PASS (including the existing suite). `cargo clippy --all-targets` shows no new warnings.
- [ ] **Step 5:** Commit: `feat(downloads): background yt-dlp queue, commands, serve downloads first`.

### Task 3: Frontend downloads store and client

**Files:**
- Create: `src/lib/downloads.ts`, `src/lib/downloads.test.ts`
- Modify: `src/components/layout/app-shell.tsx` (mount `useDownloadsBridge()` next to `useYtdlpSetup()`)

**Interfaces:**
- Consumes: Task 2 commands and event, plus `getStreamBaseUrl()` from `src/lib/stream.ts`.
- Produces:
  - Types mirroring Rust: `DlTrack`, `DlCollection`, `DownloadsIndex`, `TrackInput`, `CollectionInput`, `CollectionKind = "playlist" | "album" | "liked"`.
  - `useDownloadsStore: { index: DownloadsIndex; setIndex(i) }` (not persisted, since Rust is the source of truth).
  - `useDownloadsBridge(): void`: listen to `downloads-changed` first, then `invoke("downloads_index")`.
  - `trackDownloadState(index, videoId): "none" | "pending" | "done" | "failed"`.
  - `collectionProgress(index, id): { done: number; failed: number; total: number } | null` (null when not downloaded).
  - `downloadedCoverUrl(base: string, file?: string): string | undefined` → `${base}/cover/${file}`.
  - `trackToInput(t: ShelfItem | QueueTrack): TrackInput | null`: `meta` is the `QueueTrack` shape, `coverUrl` is the largest thumbnail.
  - Wrappers: `downloadTrack(t)`, `removeTrackDownload(videoId)`, `removeCollectionDownload(id)`.
- [ ] **Step 1: Failing tests** in `downloads.test.ts`: `trackDownloadState` returns all four states from a fixture index; `collectionProgress` on [done, failed, pending] → `{done:1, failed:1, total:3}`; an unknown id gives `null`; `trackToInput` on a `kind: "album"` ShelfItem gives `null`.
- [ ] **Step 2:** `pnpm test src/lib/downloads.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit: `feat(downloads): frontend store and client`.

### Task 4: Sync

**Files:**
- Create: `src/lib/downloads-sync.ts`, `src/lib/downloads-sync.test.ts`
- Modify: `src/lib/innertube/playlist.ts` (`fetchPlaylist(id, opts?: { strict?: boolean })`: with `strict`, rethrow continuation errors instead of `break`), `src/components/layout/app-shell.tsx` (mount `useDownloadsSync()`)

**Interfaces:**
- Consumes: Task 3 store and types, `fetchPlaylist`, `fetchAlbum`.
- Produces:
  - `fetchCollectionInput(kind: CollectionKind, id: string): Promise<CollectionInput>`. Liked Songs uses `fetchPlaylist("LM", { strict: true })` with id `"LM"` and title "Liked Songs". Playlists use `fetchPlaylist(id, { strict: true })`. Albums use `fetchAlbum(id)`. Throws if zero tracks map through `trackToInput`.
  - `downloadCollection(kind, id): Promise<void>` (fetch + `invoke("downloads_set_collection")`).
  - `syncCollection(id): Promise<void>`: no-op if not downloaded or `!navigator.onLine`. Errors are swallowed and logged, so the index is untouched.
  - `useDownloadsSync(): void`: syncs all collections sequentially on mount (if online), every 6 h, and on the `window` `online` event.
- [ ] **Step 1: Failing tests:**
  - playlist.test.ts `strict rethrows continuation failure` (mock `fetchPlaylistContinuation` to throw → `fetchPlaylist(id, {strict:true})` rejects, while the non-strict call still resolves with the first page).
  - downloads-sync.test.ts `syncCollection leaves index alone when fetch throws` (mock `fetchPlaylist` to reject → `invoke` is not called with `downloads_set_collection`), and `fetchCollectionInput rejects empty list`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(downloads): safe collection sync`.

### Task 5: 30-day offline Premium grant and playback gate

**Files:**
- Modify: `src/lib/store/premium.ts`, `src/lib/audio-engine.ts` (~446, ~494, ~596), `src/components/layout/premium-gate-dialog.tsx`
- Test: `src/lib/store/premium.test.ts` (create)

**Interfaces:**
- Produces in `premium.ts`:
  - A persisted (localStorage via `safeLocalStorage`) `premiumConfirmedAt: number | null`, set to `Date.now()` whenever `setStatus("premium")` runs. It is not cleared by `null` or `"free"`. A confirmed `"free"` sets `premiumLapsed: true` (also persisted), and `"premium"` clears it.
  - `export const OFFLINE_GRANT_MS = 30 * 24 * 60 * 60 * 1000`.
  - `export function downloadedPlaybackAllowed(now: number, s: { status; premiumConfirmedAt; premiumLapsed }): boolean` = `status === "premium" || (!premiumLapsed && premiumConfirmedAt !== null && now - premiumConfirmedAt < OFFLINE_GRANT_MS)`.
- audio-engine: the gate passes when `premiumOk || (trackDownloadState(index, streamVideoId) === "done" && downloadedPlaybackAllowed(Date.now(), premiumState))`. Subscribe reactively the same way `premiumOk` is.
- Gate dialog: when the current track is downloaded and the grant has expired, show "Connect to the internet to keep using downloads" instead of the upsell.
- [ ] **Step 1: Failing tests** for `downloadedPlaybackAllowed`: premium now → true; null status confirmed 29 days ago → true; 31 days ago → false; lapsed → false; never confirmed → false.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS, then `pnpm build`.
- [ ] **Step 5:** Commit: `feat(downloads): 30-day offline playback grant`.

### Task 6: Download controls and row status

**Files:**
- Create: `src/components/shared/download-button.tsx`
- Modify: `src/routes/playlist.$id.tsx` (actions, including Liked Songs, which currently passes `actions = null` at :88/:332), `src/routes/album.$id.tsx:96` (next to `AlbumMoreMenu`), `src/components/shared/track-context-menu.tsx` (`TrackMenuItems`), `src/components/shared/track-list.tsx` (`TrackRow`, beside the title at ~:558)

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces:
  - `CollectionDownloadButton({ kind, id }: { kind: CollectionKind; id: string })`: `<Button variant="outline" size="icon">` matching Share. `IconDownload` when off. While downloading, a progress ring with `aria-label="Downloading N of M"`. When done, `IconCircleCheckFilled` in the accent colour. Click toggles: on → `downloadCollection`, off → `removeCollectionDownload`, with no confirm (spec). When a downloaded collection's page mounts, it calls `syncCollection(id)` once.
  - `TrackDownloadStatus({ videoId }: { videoId: string })`: renders nothing for `none`; a small `IconCircleCheckFilled` (muted) for `done`; a spinner-free small `IconDownload` (muted, pulse) for `pending`; and for `failed`, `IconAlertTriangleFilled className="text-yellow-500"` in a Tooltip showing `track.error`.
  - Context menu: "Download" (`downloadTrack`) when the state is `none`. "Remove download" (`removeTrackDownload`) when the track holds the `"single"` ref. Collection-only downloads show no remove item, since they're removed via the collection.
- [ ] **Step 1:** No TSX tests run (vitest is `.ts` only). The logic is already covered by Task 3. Implement the components and wire them in.
- [ ] **Step 2:** `pnpm build` passes; `npx eslint` on the touched files is clean.
- [ ] **Step 3:** Manual check in `pnpm tauri dev`: toggle a small playlist → progress → check icon, rows show checks. Break one track by temporarily adding an invalid id via devtools `invoke` → yellow icon with a tooltip.
- [ ] **Step 4:** Commit: `feat(downloads): download toggle, menu items, row status`.

### Task 7: Downloads page and offline browsing

**Files:**
- Create: `src/routes/downloads.tsx`, `src/routes/downloads.$id.tsx`
- Modify: `src/components/layout/app-sidebar.tsx:93` (NAV_ITEMS: `{ to: "/downloads", label: "Downloads", icon: IconDownload, iconOn: IconDownload }` after Library, since Tabler has no filled download icon and none is hand-drawn)

**Interfaces:**
- Consumes: the Task 3 store and `downloadedCoverUrl`.
- `/downloads`: renders only from `useDownloadsStore`, never React Query or the network. A grid of collections (Liked Songs first, then playlists, then albums, each by title) using `ShelfCard` with a `ShelfItem` built from the `DlCollection` (thumbnails = the local cover URL, falling back to `coverUrl`) and linking to `/downloads/$id`. Below it, a "Songs" `TrackList` of single-ref tracks. Empty state: "Nothing downloaded yet. Use the download button on any playlist or album."
- `/downloads/$id`: an `EntityHeader` (title, subtitle, local cover, `CollectionDownloadButton`) plus a `TrackList` of the collection's tracks in `track_ids` order built from `meta`. Play and Shuffle queue **only `done` tracks**.
- [ ] **Step 1:** Implement. `pnpm build` regenerates `routeTree.gen.ts`, so commit the regenerated file.
- [ ] **Step 2:** `pnpm build` and lint are clean.
- [ ] **Step 3:** Commit: `feat(downloads): Downloads page and offline collection view`.

### Task 8: Offline end-to-end check

**Files:** whatever the check shows is broken. Each fix gets its own small commit.

- [ ] **Step 1:** `pnpm tauri dev`, sign in with Premium, download one album + 2 single songs, and wait for the checks.
- [ ] **Step 2:** Disable the network adapter. Restart the app.
- [ ] **Step 3:** Verify:
  - (a) The app opens to a usable shell within 10 s, with no infinite spinner.
  - (b) Downloads opens and covers show.
  - (c) The album plays end to end, including seeking.
  - (d) No Premium upsell appears.
  - (e) Home and Search show their normal error state.
  - (f) The radio button and auto-radio fail quietly, with at most a toast.
- [ ] **Step 4:** Re-enable the network. A sync runs (log line). Toggling the album off deletes `downloads/tracks/*.webm` files, while the single songs' files remain.
- [ ] **Step 5:** `pnpm test`: all pass except the pre-existing `whats-new` Cargo.lock version check. `cargo test` all pass.
- [ ] **Step 6:** Commit any fixes: `fix(downloads): offline launch …`.
