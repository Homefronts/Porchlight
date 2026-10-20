# AI Music Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One top-bar switch that hides AI music outside the user's library,
"AI" / "AI?" tags on every AI song, and detection from community lists that a
daily GitHub job cross-checks against Spotify.

**Architecture:** Pure matching logic in `src/lib/ai/` is shared by the app and
the GitHub job. The job (`scripts/ai-data/run.ts`, run with `npx tsx`) writes
`ai-artists.json` to the `ai-data` branch. The app syncs that file daily into
a persisted zustand store, with a bundled snapshot as the fallback, and
classifies `ShelfItem` / `QueueTrack` by their `artists[].id`. Filtering
happens at page level for feeds, at fetch level for radio / autoplay, and in
`next()` for playback.

**Tech Stack:** React 19 + TS, zustand persist, TanStack Query / Router,
vitest (node env, `src/**/*.test.ts`), `@tauri-apps/plugin-http`
(`tauriFetch`), GitHub Actions, Node 22 + tsx.

**Spec:** `docs/superpowers/specs/2026-10-20-ai-music-filter-design.md`

## Global Constraints

- The library is never filtered out. AI songs there are tagged, greyed, and skipped when the switch is off, with "Play anyway?" available.
- Only **confirmed** AI is ever hidden or skipped. "AI?" is a tag only.
- A song with no artist channel id can be "AI?" at most, never AI.
- The user's override (by channel id) always wins and never expires.
- No per-song network requests to classify anything.
- The switch defaults to `aiMusic: true` (shown). Copy for the reduced-mode notice is verbatim from the spec.
- Every new host fetched by the app goes in `src-tauri/capabilities/default.json`, and `hosts.test.ts` must still pass.
- The What's New copy has no em or en dashes (`whats-new.test.ts`).
- Line endings: match each file's existing blob style (scratchpad `eol.py`), then `git -c core.autocrlf=false add`.

## Review Focus

1. **A real artist who shares a name with an AI act** must never be hidden. Covered by Task 1 (no id → maybe) and Task 2 (overlap per channel).
2. **The data file is missing, corrupt or a newer `version`.** The app falls back to the snapshot or the last good data, and never crashes or hides everything. Covered by Task 3's test `rejects malformed or future-version data`.
3. **A mix that is entirely AI.** The refill stops after 3 requests, and the queue doesn't loop or spin. Covered by Task 8's test `stops refilling after 3 continuations`.
4. **`next()` with every remaining track held back.** Playback stops cleanly, with no infinite loop, including under repeat-all. Covered by Task 8's test `next() with only held tracks left stops`.
5. **The Spotify page format changes.** The job reports `degraded`, keeps the previous confirmed set, and the smoke test protects the published file. Covered by Task 2's broken-fixture test.

---

### Task 1: Matching core

**Files:**
- Create: `src/lib/ai/match.ts`
- Test: `src/lib/ai/match.test.ts`

**Interfaces:**
- Produces:
  - `normalizeName(s: string): string` lower-cases, strips diacritics and punctuation, collapses whitespace, and drops a leading "the ".
  - `normalizeTitle(s: string): string` is `normalizeName` plus dropping bracketed suffixes `( … )` / `[ … ]` and `feat.` tails.
  - `type AiData = { version: 1; generatedAt: string; status: { spotify: "ok"|"degraded"; lists: "ok"|"stale"; message: string|null }; confirmed: Record<string,string>; maybeNames: string[]; sources: {name:string;url:string;license:string}[] }`
  - `type AiClass = "ai" | "maybe" | null`
  - `type AiOverrides = Record<string, "ai" | "not-ai">` (keyed by channel id)
  - `classifyArtists(artists: {id?: string; name: string}[] | undefined, data: AiIndex, overrides: AiOverrides): AiClass`
  - `type AiIndex = { confirmed: Set<string>; maybe: Set<string> }` and `indexAiData(d: AiData): AiIndex`

- [ ] **Step 1: Write failing tests** `match.test.ts`:
  - `normalizeName("The Velvet Sundown")` → `"velvet sundown"`; `normalizeName("Beyoncé!")` → `"beyonce"`.
  - `normalizeTitle("Dust on the Wind (Official Video)")` → `"dust on the wind"`.
  - `classifyArtists([{id:"UC1",name:"X"}], idx(confirmed UC1))` → `"ai"`.
  - Any credited artist confirmed → `"ai"` (second of two artists).
  - Name in maybe, id not confirmed → `"maybe"`; name in maybe and **no id** → `"maybe"`; confirmed name but **no id** → `"maybe"` at most.
  - Override `"not-ai"` on a confirmed id → `null`; override `"ai"` on an unknown id → `"ai"`.
  - `undefined` / `[]` artists → `null`.
- [ ] **Step 2:** `pnpm vitest run src/lib/ai/match.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. The override check comes first, per artist; "not-ai" on any credited artist only clears that artist.
- [ ] **Step 4:** Run again → PASS.
- [ ] **Step 5:** Commit `feat(ai): matching core`.

### Task 2: Daily data job

**Files:**
- Create: `src/lib/ai/build.ts` (pure decisions), `src/lib/ai/build.test.ts`, `src/lib/ai/fixtures/spotify-embed.html` (real, trimmed), `src/lib/ai/fixtures/spotify-embed-broken.html`
- Create: `scripts/ai-data/run.ts` (IO only), `.github/workflows/ai-data.yml`

**Interfaces:**
- Consumes: Task 1 `normalizeName`, `normalizeTitle`, `AiData`.
- Produces:
  - `parseSpotifyEmbed(html: string): { name: string; tracks: string[] } | null` reads `__NEXT_DATA__` → `props.pageProps.state.data.entity`.
  - `parseCsvArtists(csv: string): { name: string; spotifyId: string }[]`
  - `decideChannel(spotifyTracks: string[] | null, ytSongTitles: string[]): "ai" | "maybe"` returns "ai" only if the normalised sets intersect. `null` (Spotify failed) → "maybe".
  - `spotifyStatus(attempted: number, failed: number, parsedAny: boolean): "ok" | "degraded"` returns degraded if `failed > attempted/2` or `!parsedAny` when attempted > 0.
  - `mergeResults(prev: AiData | null, next: Partial<AiData>, degraded: boolean): AiData` keeps every previous `confirmed` entry when degraded, and never shrinks `confirmed` on a degraded run.
  - `maybeNames` excludes names shorter than 4 characters.

- [ ] **Step 1: Write failing tests:**
  - The fixture parses to name "The Velvet Sundown", with "Dust on the Wind" first.
  - The broken fixture → `null`.
  - `decideChannel(["Dust on the Wind"], ["Dust On The Wind (Official Audio)"])` → `"ai"`; no overlap → `"maybe"`; `null` → `"maybe"`.
  - `spotifyStatus(10, 6, true)` → degraded; `(10, 1, true)` → ok; `(10, 0, false)` → degraded.
  - `mergeResults` with degraded keeps the old confirmed ids.
  - CSV with a header and a quoted comma parses.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `build.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5: `run.ts`.**
  - Download CennoxX `SpotifyAiArtists.csv` and the gounetmusic list (URL from CennoxX PR #1301).
  - Include the CevvalKoala list **only if** its repo has a license file. Otherwise skip it and log why (spec: ask permission first).
  - Load state from `ai-data` branch `state.json` (per-artist results plus `checkedAt`).
  - Process the new entries plus the oldest ~1/14 of the rest. Spotify embed fetches run one at a time with a 1.5 s delay.
  - For each artist, run a YouTube Music search (unauthenticated `WEB_REMIX`, client version as in `src/lib/innertube/shared.ts`). Take artist results whose `normalizeName` matches, fetch each channel's songs (browse the channel id; first songs shelf), and call `decideChannel`.
  - Write `ai-artists.json` and `state.json`.
  - **Smoke:** after the build, assert that The Velvet Sundown, Xania Monet and Breaking Rust each have at least one confirmed channel, and that no confirmed name normalises to "queen". On failure, exit non-zero before writing.
- [ ] **Step 6: Workflow** `ai-data.yml`:
  - Triggers: `schedule: cron "17 5 * * *"` and `workflow_dispatch`.
  - `permissions: contents: write`.
  - Steps: checkout `main`; check out `ai-data` into `./ai-data-out`, creating an orphan branch if it's missing; `npx -y tsx scripts/ai-data/run.ts ./ai-data-out`; commit and push only if the files changed.
- [ ] **Step 7: Trial run.**
  - Push the branch, then `gh workflow run ai-data.yml -R Homefronts/YTubic- --ref <branch>`.
  - Confirm `ai-artists.json` appears on `ai-data` with `status.spotify == "ok"` and the smoke artists confirmed.
  - If the runners are blocked by Spotify, ledger it. The design already degrades, so continue.
- [ ] **Step 8:** Commit `feat(ai): daily AI artist data job`.

### Task 3: App data store and sync

**Files:**
- Create: `src/lib/ai/data.ts`, `src/lib/ai/data.test.ts`, `src/lib/ai/snapshot.json` (copy of the first good job output)
- Modify: `src-tauri/capabilities/default.json` (add `https://raw.githubusercontent.com/*`), `src/components/layout/app-shell.tsx` (mount `useAiDataSync()`)

**Interfaces:**
- Consumes: Task 1 `AiData`, `indexAiData`.
- Produces:
  - `AI_DATA_URL = "https://raw.githubusercontent.com/Homefronts/YTubic-/ai-data/ai-artists.json"`
  - `parseAiData(json: unknown): AiData | null` returns null on a bad shape or `version !== 1`.
  - `useAiDataStore` (persisted `ytubic-ai-data`): `{ data: AiData | null; fetchedAt: number; setData(d, at) }`
  - `currentAiData(): AiData` (store data or snapshot) and `useAiIndex(): AiIndex` (memoised).
  - `aiDetectionMode(d: AiData, now: number): { reduced: false } | { reduced: true; reason: "spotify" | "lists" | "stale"; message: string }`. Stale means `generatedAt` is older than 7 days. `status.message` overrides the copy.
  - `useAiDataSync()`: fetch at launch and every 24 h via `tauriFetch`; ignore failures (offline).

- [ ] **Step 1: Failing tests:**
  - `rejects malformed or future-version data` (`parseAiData({version:2})` → null, garbage → null, snapshot → ok).
  - `aiDetectionMode`: ok → not reduced; spotify degraded → reason spotify with the verbatim spec copy; lists stale → the lists copy; generatedAt 8 days old → stale.
- [ ] **Step 2:** FAIL. **Step 3:** Implement and wire the sync into `app-shell.tsx` next to `useDownloadsSync`. **Step 4:** PASS, plus `pnpm vitest run src/lib/lyrics/hosts.test.ts` PASS.
- [ ] **Step 5:** Commit `feat(ai): sync AI artist data`.

### Task 4: Setting, overrides and the classification hook

**Files:**
- Modify: `src/lib/store/settings.ts` (add `aiMusic: boolean`, default `true`, plus `setAiMusic`)
- Create: `src/lib/ai/overrides.ts` (persisted `ytubic-ai-overrides`: `byChannel: AiOverrides`, `set(id, v | null)`)
- Create: `src/lib/ai/use-ai.ts`

**Interfaces:**
- Produces:
  - `useAiClass(item: { artists?: {id?: string; name: string}[] }): AiClass`
  - `aiClassNow(item): AiClass` (non-hook, reads the stores; used in playback)
  - `isAiBlocked(item): boolean`, which is `!settings.aiMusic && aiClassNow(item) === "ai"`.

- [ ] **Steps:** Write `use-ai.test.ts` for `isAiBlocked` (switch on → false; off with confirmed → true; off with maybe → false; off with a not-ai override → false). FAIL → implement → PASS → commit `feat(ai): setting, overrides, classification`.

### Task 5: The AI tag

**Files:**
- Create: `src/components/shared/ai-badge.tsx`, with `AiBadge({ maybe }: { maybe?: boolean })` built like `explicit-badge.tsx`.
  - Label: "AI", or "AI?" with reduced opacity.
  - `title` / `aria-label`: "AI-generated", or "Possibly AI: shares a name with a known AI artist".
- Modify: `src/components/shared/track-list.tsx` (next to `ExplicitBadge` at ~572), `src/components/shared/shelf-card.tsx`, `src/components/layout/queue-panel.tsx` (queue rows), `src/components/layout/player-bar.tsx` and `player-bar-bottom.tsx` (title line).

- [ ] **Steps:** Render `{cls ? <AiBadge maybe={cls === "maybe"} /> : null}` from `useAiClass`. Verify with `pnpm build`, then manually (a Velvet Sundown search shows "AI"). Commit `feat(ai): AI tag`.

### Task 6: Top-bar toggle, settings mirror, reduced-mode notice

**Files:**
- Create: `src/components/layout/ai-toggle-button.tsx`
- Modify: `src/components/layout/top-bar.tsx`. Place the button after the drag spacer, inside `<header>`, with a right margin that clears the window-controls cluster rendered below it (measure the cluster's width in the same file). Hide it while `fullscreen`, like the nav buttons.
- Modify: `src/components/settings/playback-tab.tsx` (a `SettingRow` with a `Switch`, plus the reduced-mode line under it).

**Interfaces:**
- Consumes: Task 3 `aiDetectionMode`, Task 4 `aiMusic`.

- [ ] **Steps:**
  - The button uses `NAV_BTN_CLS` sizing. Its "AI" glyph is struck through when `aiMusic === false`. The tooltip reads "AI music hidden · click to show" or "AI music shown · click to hide". It shows a small amber dot when reduced.
  - On the first transition into reduced mode, show one `toast()` with the spec copy. Remember the reason shown in the persisted store so it isn't repeated, and show it again only if the reason changes.
  - `pnpm build`, a manual check, then commit `feat(ai): top-bar toggle`.

### Task 7: Hide AI outside the library

**Files:**
- Create: `src/lib/ai/filter.ts`, `src/lib/ai/filter.test.ts`, `src/lib/ai/use-in-library.ts`
- Modify: `src/routes/search.tsx`, `src/routes/index.tsx` (home), `explore.tsx`, `charts.tsx`, `new-releases.tsx`, `moods_.$id.tsx`, `browse.$id.tsx`, `artist.$id.tsx`, `playlist.$id.tsx`, `album.$id.tsx`

**Interfaces:**
- Produces:
  - `filterAiItems<T extends {kind?: string; artists?: {id?: string; name: string}[]; id?: string}>(items: T[], blocked: (i: T) => boolean): T[]`. For `kind:"artist"` items, blocked means `id` is confirmed.
  - `useAiFilter(): <T>(items: T[]) => T[]` (identity when the switch is on).
  - `useInLibrary(kind: "playlist" | "album", id: string): boolean`. True for: `LM` (Liked Songs); an id found in the cached `["library","playlists"]` query (as in `app-sidebar.tsx:308`); a new `["library","albums"]` query via `fetchLibraryAlbums`; an editable (owned) playlist; or a downloaded collection (`useDownloadsStore`).

- [ ] **Step 1: Failing tests** in `filter.test.ts`: hides confirmed songs, keeps maybe, keeps songs without ids, hides confirmed artist cards, keeps everything when not blocked.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Apply.**
  - Wrap every shelf / result list passed to `ShelfCarousel` / `ShelfGrid` / `TrackList` on those pages with `useAiFilter()`.
  - Playlist and album pages apply it only when `!useInLibrary(...)`.
  - The artist page: if the artist's own channel id is confirmed and the switch is off, render the header plus a banner "This artist is marked as AI" instead of shelves.
- [ ] **Step 6:** `pnpm build` and the manual list from the spec. Commit `feat(ai): hide AI music outside the library`.

### Task 8: Playback (skip, refill, Play anyway, menus)

**Files:**
- Modify: `src/lib/store/playback.ts` (add `aiAllowed?: true` to `QueueTrack`; `next()` skips `isAiBlocked && !aiAllowed`), `src/lib/store/playback.test.ts`
- Modify: `src/lib/audio-engine.ts` (~892 continuation and ~929 autoplay radio: filter, then refill), `src/lib/radio-mix.ts`, the `fetchRadio` callers (`track-context-menu.tsx:313`, `album-menu.tsx:120`, `use-deep-links.ts:36`, `artist.$id.tsx:169`, `search.tsx:424`), `src/lib/play-playlist.ts`
- Modify: `src/components/shared/track-list.tsx` (greyed held rows; a click opens the "AI music is off. Play anyway?" prompt, and confirming plays with `aiAllowed`), `src/components/shared/track-context-menu.tsx` (Mark artist as AI / Not AI / Reset; Play anyway; "Report to community list" → open `https://github.com/CennoxX/spotify-ai-blocker/issues/new/choose`), `src/components/layout/queue-panel.tsx` (greyed held rows)

**Interfaces:**
- Consumes: Task 4 `isAiBlocked`, Task 7 `filterAiItems`.
- Produces: `refillFiltered(first: ShelfItem[], token: string | undefined, fetchMore: (t: string) => Promise<{tracks: ShelfItem[]; continuation?: string}>, max = 3): Promise<{tracks: ShelfItem[]; continuation?: string}>`. It loops while the filtered count is < 10 and the token exists, up to `max` times. It lives in `src/lib/ai/filter.ts`.

- [ ] **Step 1: Failing tests:**
  - `next() skips held AI tracks`.
  - `next() plays an aiAllowed AI track`.
  - `next() with only held tracks left stops`, under repeat off **and** repeat all (no infinite loop: bounded by queue length).
  - In `filter.test.ts`: `stops refilling after 3 continuations` (fetchMore always returns AI → called exactly 3 times).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Apply the filter plus refill at every radio / autoplay / continuation site listed. Library playback (`play-playlist.ts` from a library page) keeps the tracks; `next()` handles the skipping.
- [ ] **Step 6:** Full suite: `pnpm vitest run` all green, plus `pnpm build`. Commit `feat(ai): skip AI in playback, play anyway, menus`.

### Task 9: Credits and release notes

**Files:** `README.md` (Credits: CennoxX list (MIT), gounetmusic list (CC BY 4.0), and CevvalKoala if used), `src/components/layout/about-dialog.tsx` (one line: "AI detection uses community lists by …"), `src/lib/whats-new.ts` (0.7.0 entry, no dashes)

- [ ] **Steps:** Edit, then `pnpm vitest run src/lib/whats-new.test.ts`. The version bump happens at release time, not here: the What's New test pins the head entry to package.json, so add the entry **with** the bump at release. Commit `docs(ai): credits`.
