# Porchlight: the whole project, written up (as of 2026-10-31)

This is the complete handoff for another AI, or a person, picking up the project. Part 1 is the whole story and how everything fits together. Part 2 is the current work (layouts) in full detail, with exactly what's left. Read it all before touching anything.

Related docs this builds on:
- `docs/superpowers/handoffs/2026-10-28-themes-release-1.md` (themes)
- `docs/superpowers/handoffs/2026-10-30-porchlight.md` (the rename)
- `docs/superpowers/handoffs/2026-10-31-layouts.md` (layouts; Part 2 here includes all of it)

---

# Part 1: The project

## What Porchlight is

Porchlight is a desktop YouTube Music client for Windows (x64 and arm64), macOS and Linux (both beta).

- **Stack:**
  - Tauri 2 (Rust backend)
  - React 19 + TypeScript
  - Tailwind v4
  - TanStack Router and Query
  - zustand (persisted stores)
  - idb-keyval (IndexedDB)
  - vitest for tests
  - NSIS installers on Windows
- **Repo:** `Homefronts/Porchlight` on GitHub. Locally at `C:\Users\sdand\Desktop\YTubic Plus`; the folder still has the old name, which is fine.
- **Origin:** a fork of **NUber-dev/YTubic** by George Shyshov (NUber).
  - It started as "YTubic Plus", a community edition, and was renamed to Porchlight at 1.0.0.
  - **The README credits NUber/YTubic forever.** Never touch NUber's original repo or releases.
  - It's GPL-3.0.
- **Publisher name:** Homefronts. App ID: `io.github.homefronts.porchlight`. The old ID was `com.github.ivasy.ytubic`.

## The user

- They own the project and make every product call.
- **Tone:** casual, friendly replies, any length, no corporate speak. Explain things in plain words, not jargon.
- **Mockups first:** they want to see an **HTML mockup with real data before any UI is rebuilt**. Real covers, their real tracks, their real screen.
- **Often remote:**
  - Send screenshots and files to them; don't just describe them.
  - Open HTML in their browser with `Start-Process <file>` when they're at the PC.
- **Choices:** they like being given a recommendation with options, not an open-ended question.
- **Usage limits:** they hit Claude usage limits. Keep handoff docs current.

## History: every release

Newest first. The full user-facing changelog is in `README.md` → Changelog.

| Version | Date | What it was |
|---|---|---|
| 1.1.0 | release commit done, not tagged | **Layouts**: Gatefold, Index, Crate, Panels, the turntable dial, Ctrl+L, the flip, Player colour, Crate liner notes. On branch `layouts`, unpushed. |
| 1.0.0 | 2026-10-29/30 | **Porchlight**: rename from YTubic Plus, new app ID, sits beside the original YTubic, porchlight:// links (old ytubic-plus:// still work). |
| 0.9.1 | 2026-10-29 | The bridge: saves a handoff copy of settings and library so Porchlight can import them on first launch. |
| 0.9.0 | 2026-10-29 | **Looks**: five looks (Sleeve, Paper, Ink liner, Ink, Classic), the "Make it yours" picker, custom looks with a live editor, look files to share. |
| 0.8.1 | 2026-10-27 | User requests: Lyrics in Player toggle, plain YouTube Music share links, radio skips dislikes, window titles. |
| 0.8.0 | 2026-10-23 | **Rewind** (a quarterly listening recap, local-only), Google Takeout import, Add to library, rename and delete playlists. |
| 0.7.5 | 2026-10-21 | **Music videos** (Song/Video switch plays the real video, synced), video quality, the report-a-bug button. |
| 0.7.0-0.7.2 | 2026-10-20/21 | **AI music filter** (community lists checked against Spotify), AI tags, Check for Updates. |
| 0.6.0 | 2026-10-19 | First "YTubic Plus": radio mixes, mood chips, **offline downloads**, Downloads page. |
| 0.2.0-0.5.1 | 2026-07 to 09 | Early fork work: review fixes, login fixes and more. |

Design specs and plans for the big features are in `docs/superpowers/specs/` and `docs/superpowers/plans/`:
- offline-downloads
- ai-music-filter
- rewind
- themes
- porchlight
- layouts

## The Porchlight rename and the update bridge (important, don't break it)

The goal, in the user's words: "whatever makes it easier for the end user to update to the new app ID without having any hitches."

- **0.9.1, the bridge:** published on the old YTubic Plus feeds. It writes a handoff (settings, library, looks, Rewind IndexedDB, downloads, the Mac/Linux login key) and installs Porchlight.
- **Porchlight first launch:**
  - Detects the handoff and imports it, using `src-tauri/src/migrate.rs` and the frontend import code.
  - Moves downloads, makes a shortcut and uninstalls the old app.
  - Safety checks prove an install really is YTubic Plus: the version, the stamp being newer than the exe, and the uninstall-key time. That keeps NUber's YTubic from being touched.
- **Stub repos keep serving 0.9.1 forever.** Each holds only a `latest.json` plus 0.9.1 as Latest. **Never delete them.** Keep the move code long-term, and check 0.9.1 download counts before ever tidying it.
  - `Homefronts/YTubic-Plus`: the old feed. It also hosts the old share page, ai-data and the icon.
  - `Homefronts/YTubic-`: the feed for the 0.6-0.7.1 versions.
- **Verified feeds:** Porchlight serves 1.0.0; YTubic-Plus and YTubic- serve 0.9.1.
- **Known gap (1.0.1 fix):** downloading the Porchlight installer from the website skips the bridge. The user hit this themselves, then the in-app update path worked.
  - Fix: a README and release-page note, "Already on YTubic Plus? Update from inside the app".
  - Also: Porchlight should detect an un-updated Plus install and tell the user to update it first.

## Leaving the fork network (pending on GitHub)

- The user opened a GitHub Support ticket on 2026-10-30 through the virtual assistant: "I want GitHub Support to help detach/extract", with the reason "diverged significantly".
- When GitHub finishes, verify:
  - the v1.0.0 and v0.9.1 releases and their assets
  - all 3 feeds
  - stars and issues
- Release backup: `C:\Users\sdand\PorchlightReleaseBackup-2026-10-30`.

## How the code is laid out

- `src/routes/`: TanStack file routes, one per page. Home, explore, search, library, playlist, album, artist, downloads, rewind, `shelf.$title`, and so on. `src/routeTree.gen.ts` is generated and gitignored.
- `src/components/layout/`: the app frame.
  - `app-shell.tsx`, `app-sidebar.tsx`, `top-bar.tsx`
  - the player bars `player-bar.tsx` and `player-bar-bottom.tsx`
  - `fullscreen-player.tsx`, `lyrics-view.tsx`
  - `shells/`, the five layouts (see Part 2)
- `src/components/theme/`: the look engine UI.
  - `look-editor.tsx`, `make-it-yours.tsx`, `welcome.tsx`
  - the touch components: Vinyl, TapeCounter, SectionLabel, TransportLabel
  - `turntable-dial.tsx`, `layout-flip.tsx`
- `src/lib/theme/`: looks.
  - `looks.ts` holds the built-in looks and seeds.
  - `tokens.ts` derives CSS variables from six seeds (seven with the new Player colour).
  - `store.ts` is the `ytm-looks` zustand store, holding look, layout, pickerSeen, dialTipSeen and so on.
  - Also `edit.ts`, `manage.ts`, `file.ts` (look files), `first-launch.ts` and `layouts.ts`.
- `src/lib/store/`: playback, with `ytm-playback` persisted (queue, index, position); player layout mode (`right`/`bottom`/`floating`); and fullscreen.
- `src/lib/innertube/`: the YouTube Music API client. `src/lib/lyrics/`, `src/lib/ai/` (AI filter), `src/lib/rewind/`, downloads, lastfm, updater, deep links.
- `src-tauri/src/`:
  - `lib.rs`, `appid.rs`, `bridge.rs`, `migrate.rs`
  - `downloads.rs`, `ytdlp.rs`, `media.rs`
  - `discord.rs`, `lastfm.rs`, `thumbbar.rs`, `power.rs`
- The floating mini player is a second window (`floating-player-app.tsx`). It shares the `ytm-looks` storage key, so the look follows it.

## Look engine (themes) in one paragraph

A look is a set of six seed colours (bg, fg, acc, dim, faint, line), plus fonts, radii and touches. `tokens.ts` derives every CSS custom property from the seeds, and they're applied on `<html>` along with `data-look` and `data-touch-*` attributes. Classic is the original stylesheet, so it derives nothing and must stay pixel-identical to the pre-themes app.

Custom looks are drafts copied from a built-in look. Look files export and import them. The new optional 7th seed, `player`, paints the player areas of the non-Sidebar layouts.

## Release pipeline

- **CI:** `.github/workflows/ci.yml` runs build, typecheck, lint, test and `cargo test`.
- **Release:** `.github/workflows/release.yml` builds Windows, Windows ARM64, Linux and macOS Universal with tauri-action. A "Clarify asset names" step renames assets to `Porchlight_<ver>_...` and repoints `latest.json`.
- **Pushing a `v*` tag starts the release build.**
  - Don't also run `gh workflow run`.
  - Pull first, and push `main` **before** the tag.
- **The user publishes the release themselves.** Publishing releases, creating public repos and some registry edits are blocked by the auto-mode classifier. When the user sends a `! <command>` line, run it.
- Version lives in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `Cargo.lock`. Each release also adds a What's New entry in `src/lib/whats-new.ts`, where a test checks that the first entry matches package.json, plus a README changelog entry.
- The app auto-updates from GitHub Releases `latest.json`, checking every 6 hours.

## Tooling and how the work gets done

- **Skills used:** the superpowers plugin at `C:\Users\sdand\.claude\plugins\cache\claude-plugins-official\superpowers\7.0.0\skills\`.
  - **brainstorming:** talk it through, then a written spec. A builder subagent checks the spec, then the user approves it.
  - **writing-plans:** a plan with tasks, global constraints and review focus.
  - **subagent-driven-development:** described below.
- **Subagent-driven development:**
  - Per task:
    1. Extract a brief file: the global constraints, the task text, and "carried" notes from earlier tasks.
    2. Dispatch one implementer (opus). It commits and writes a report file.
    3. Run `scripts/review-package BASE HEAD` to make a diff file.
    4. Dispatch a task reviewer (opus). It gives two verdicts, spec and quality.
    5. Run fix rounds by **resuming the same implementer** with SendMessage, each followed by a scoped re-review (sonnet).
  - At the end: one whole-branch review (opus), one fix dispatch, and a re-review.
  - Never run two implementers at once.
  - **The ledger** (`.superpowers/sdd/<plan>/progress.md`, gitignored) records everything, including a `Ruling:` line for every decision. After a context reset, trust the ledger and `git log` over memory.
- **Usage limits:**
  - An agent that dies on a usage limit keeps its work. Resume **the same agent** with SendMessage after the reset.
  - Overnight, an hourly CronCreate watchdog did this automatically. Delete the watchdog when done.
- **run-app skill** (`.claude/skills/run-app/`):
  - Launch with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" pnpm tauri dev`.
  - Drive it with `node .claude/skills/run-app/cdp.mjs eval "<js>"` or `cdp.mjs shot out.png`.
  - The dev build **uses the installed app's real data** (see the rules below).
  - Dev runs re-point the `porchlight://` and `ytubic-plus://` URL schemes to the debug exe, so put them back afterwards.
  - Leftover Vite can hold port 1420.
- **Other project skills:** `release-cover` (What's New cover image).

## The user's hard rules (always)

1. **Never take full-desktop screenshots.** The user's other apps are private (an early one caught their Discord). Use app-only CDP screenshots only.
2. **Never push, tag or publish without the user's explicit go.**
3. **Back up the user's data around any app run, and restore it.** Before launching the dev app:
   - Copy `%LOCALAPPDATA%\io.github.homefronts.porchlight` and `%APPDATA%\io.github.homefronts.porchlight` aside.
   - `reg export` both `HKCU\Software\Classes\porchlight` and `HKCU\Software\Classes\ytubic-plus`.
   - Restore and verify file counts and sizes afterwards.
   - Rename folders aside rather than deleting them.
   - Don't start playback on their account unless a test truly needs it.
4. Old update feeds must keep serving 0.9.1.
5. Never touch NUber's original YTubic.
6. UI copy has **no em or en dashes**.
7. Classic look + Sidebar layout stays pixel-identical to 1.0.
8. Respect `prefers-reduced-motion`.
9. Tests:
   - vitest runs in the node env.
   - Use a `// @vitest-environment jsdom` pragma for DOM tests.
   - No JSX in test files.
10. `src-tauri/Cargo.toml` shows as modified in git status, but it's only line endings. Leave it out of commits.
11. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
12. Make HTML mockups before UI redesigns, and let the user approve them.

## Memory files

`C:\Users\sdand\.claude\projects\C--Users-sdand-Desktop-YTubic-Plus\memory\` holds the persistent notes, indexed in `MEMORY.md`:
- release tag rules
- Porchlight release state
- the ponytail hook timeout patch
- the Lokal reference (an MIT player used for ideas; rework, don't copy)
- feedback on mockups and relaxed replies

---

# Part 2: The current work, layouts

Porchlight 1.0 had one layout, Sidebar. This project adds four more, **Gatefold, Index, Crate and Panels**. The user switches between them "on a whim" ("feeling like a change") with a **turntable dial** next to the logo (their pick: "I like B, it's unique!"), **Ctrl+L**, and a record-flip animation.

All four ship together in one update (the user's call). The floating mini player works in every layout ("a hallmark feature of most music player apps"). Crate's crate browsing is Home only (the user's call).

- **Spec:** `docs/superpowers/specs/2026-10-30-layouts-design.md`. This is the authority; read its anti-goals.
- **Plan:** `docs/superpowers/plans/2026-10-30-layouts.md`, Tasks 1-9.
- **Mockups:**
  - `docs/superpowers/specs/2026-10-27-themes-mockups/liner-layouts.html`
  - `docs/superpowers/specs/2026-10-30-layouts-mockups/empty-and-compact.html`
  - Artifacts: https://claude.ai/artifact/27xaUPVn1bEUDMimjTYB4N and https://claude.ai/artifact/RRUSa1YhZNp4B4X5RLnFJZ
- **Ledger:** `.superpowers/sdd/2026-10-30-layouts/progress.md`. It's gitignored and lives only on this PC. The same folder holds the briefs, reports, review diffs, `final-review.md` and screenshots in `shots/task-N/`.
- **Branch:** `layouts`, from `main` after 1.0.0. **Nothing is pushed.** `git log --oneline 37a3db2..layouts` lists every commit.

## The layouts

| Layout | Shape |
|---|---|
| Sidebar | Today's 1.0 layout, unchanged. The dial sits by the logo. |
| Panels | Rounded panels: nav, a page with a cover-colour wash, a Now playing panel, and a bottom player bar. Compact form: icon rail, and Now playing folds into the bar. |
| Index | A magazine "Contents" Home with numbered shelves, 3 covers each and "{n} RECORDS". A cassette-label strip player across the top, and an "Appendix · Playlists" column. Each shelf opens `/shelf/$title`. Empty strip: "Nothing on the tape". |
| Gatefold | An open double LP. The left page is the playing record: cover, credits, a lyric sheet and the transport. The right page has tabs plus the routed page. Empty: "Nothing playing yet" with 3 picks from Home. |
| Crate | Home is a record crate: leaning sleeves, a big front record, shelf dividers, and **liner notes** under the record. A turntable along the bottom spins, with the label cut from the cover. Other routes render normally in the stage. |

## Architecture

- `app-shell.tsx` keeps every layout-independent effect and dialog, and renders `shellFor(layout)` from `src/components/layout/shells/index.ts`.
- **The page never remounts on a switch.** The routed page and its scroller (`<main class="app-scroll">`) live in a persistent node. `shells/persistent-page.tsx` portals it into each shell's slot and restores scroll and focus.
- **Shell contract.** Every `shells/*-shell.tsx`, with its parts in `shells/<name>/`, must:
  - provide the Home header slot via `RouteHeaderSlotContext`
  - publish `--shell-left-inset`, `--shell-right-inset` and `--shell-bottom-inset` via `shells/insets.ts`, so the jump pill, selection toolbar and toasts clear its chrome
  - give the dial a correct "visible" signal (non-Sidebar shells nest a `SidebarProvider`)
  - have a pop-out-to-floating button
  - keep Settings, Downloads, playlists and the account menu (`UserProfile`) reachable
- **Switching:**
  - `src/lib/theme/layouts.ts` holds `LAYOUT_ORDER`, the names, `nextLayout` and `dialTipOpen`.
  - `src/components/theme/layout-flip.tsx` has `flipTo` and `cycleOnKey`. Ctrl+L is ignored in inputs, while the first-launch picker is open, and while a dialog is open.
  - The layout is stored as `layout` in `ytm-looks`. Upgraders stay on Sidebar.
- **Floating:**
  - Works in every layout.
  - Outside Sidebar, player mode `"floating"` is the on/off switch and the built-in player stays visible.
  - The "Side card" and "Bottom bar" options only show in Sidebar.
- **Shared helpers:**
  - `shells/compact.ts` (`useCompact`, at 1100px)
  - `shells/insets.ts` (`useHeight`)
  - `player-chrome.ts` (`COVER_RADIUS`)
  - `shells/player-colour.ts` (`usePlayerStyle`)
  - `shells/crate/liner-notes.tsx`

## Progress

| Task | Status | Commits |
|---|---|---|
| 1 Mockups | done (user approved) | 40c1b97 |
| 2 Swappable shell | done | 5f7e941, 67a8493 |
| 3 Dial, Ctrl+L, flip, Settings, picker, theme-file offer | done | a274a0c, 0dcdec9 |
| 4 Panels | done | 1931145, b79c72a, d553c3a |
| 5 Index (+ shelf route) | done | f1e7b76, 64b3723 |
| 6 Gatefold | done | 816910a, c872210 |
| 7 Crate | done | f3ee0a0, 7a34624 |
| 8 Live switching pass + fixes | done | ed45663, 7e966fb, b1604a5, b351003, 0b976b6, f9f8f49 |
| Final whole-branch review + fixes | done | dc287cd, 90c068a, 82be314, 37acbb9, cbb2471, 0906868, 7034494 |
| 9A Release prep (What's New, README, live checks) | done | 4647b7a, 1c3ac98 |
| Crate volume slider clip fix (user found it) | done | 2b87dc2 |
| Player colour (user request) | done, **not yet checked live** | daede91 |
| Crate liner notes (user request, mockup approved) | done, checked live at full size | 55a826c |
| Crate artist names link to the artist page (user request) | done, links checked live | fdfc658 |
| Bug hunt on the post-release-prep changes (user asked "check for bugs again"): 3 Important + 5 Minor, all fixed | done; liner notes rechecked live (12 rows, Home doesn't scroll) | c8b0efc, 6aff92c, 5225e01, 937eb42, 96dfffe, 91a793b, 160c26e |
| Handoff docs | done | 4d0b6c4, 0950fc3 (kept current with every change) |
| Ink Sign in button readable (on-brand) | done | 93513d9 |
| README: update YTubic Plus from inside the app | done | 7f2f4e8 |
| 9B Version bump + release commit | 1.1.0 chosen by the user; release commit done; next: installed update test, then user tags | see `git log -1 --grep "release: 1.1.0"` |

What the reviews and the live pass caught along the way (all fixed):
- The scroller remounting on a swap.
- Home's header slot getting lost.
- The dial tip pointing at a hidden dial.
- Screen-reader radio clicks.
- Overlays covering the player bars, which is why the inset vars exist.
- A signed-in user unable to sign out in Index.
- Shelf links changing after a Home refresh.
- Crate focus loss.
- Long lists going blank after a flip.
- Ctrl+L wiping a half-typed bug report.

### The user's requests while testing the dev build

1. **The Crate volume slider was clipped** by the turntable footer's `overflow-hidden`. Now only the record deck clips (`overflow-y-clip`).
2. **The colour of Index's top bar couldn't be edited.**
   - The user chose **one optional "Player" colour**, a 7th seed (`Seeds.player`). It paints the player area of:
     - Index (the strip)
     - Panels (the bar)
     - Gatefold (the left page)
     - Crate (the turntable)
   - Text on it picks a readable colour automatically.
   - If it's unset, everything looks as before. It's saved in look files, and Sidebar is untouched.
   - Report: `player-colour-report.md` in the ledger folder.
3. **"Crate feels empty on Home."** The user chose liner notes and loved the mockup ("that is sick! and it's different!").
   - Mockup: `.superpowers/sdd/2026-10-30-layouts/crate-liner-notes-mockup.html`.
   - The panel shows the front record's first 12 tracks as Side A and Side B, with the playing track lit. Clicking a row plays from there, and "Open the full record" goes to the page.
   - Songs show credits instead.
   - Tracks are fetched only after the crate settles for 250ms.
   - Rows by window height: 6 per side at 940px or taller, 3 at 800px or taller, hidden below that.
4. **"In Crate you should be able to click on the artist."** Artist names now link to the artist page in three places:
   - the liner notes rows (clicking elsewhere on a row still plays)
   - a single's credits
   - the front record's subtitle, when YouTube gives artist ids (playlists like "Auto playlist" stay plain)

   The turntable's artist was already a link.

5. **"Let's check for bugs again"** (2026-10-31). An opus bug hunter read every change since release prep; the findings are in `.superpowers/sdd/2026-10-30-layouts/bug-hunt.md` and the fixes in `bug-fix-report.md`.
   - First, I painted a test Player colour onto `<html>` in the running app.
     - Index's strip, Gatefold's left page and Crate's turntable paint correctly and stay readable.
     - Sidebar was untouched.
     - Panels takes the colour through an inline `--surface`; checked by applying the same tokens to its bar wrapper: the bar paints green and stays readable. All four layouts verified.
   - Fixes:
     1. An older playlist load kept adding pages after a newer play started. Now a generation counter means only the latest play streams.
     2. "On" states (shuffle, repeat, Like, the brand play disc, "Now playing") vanished on a Player colour close to the accent. `playerTokens` now swaps `--brand`/`--acc1` to the readable colour when contrast is under 3:1.
     3. An artist link in Index's strip vanished on hover. This bug was older than today.
     4. Crate's front record lost its type and year after the artist-link change. Now it keeps them.
     5. A damaged saved look could crash the player areas. `usePlayerStyle` now falls back.
     6. Clicking an unlinked artist name in a liner row didn't play. Now it does.
     7. Liner notes now measure the real free space (3 to 6 rows) instead of using window-height guesses.
     8. A liner row click now plays the tracks shown, so a reordered mix can't play a different song.
   - Known shortcuts:
     - The liner header and footer height (72px) is an estimate.
     - A linked artist whose name isn't in the subtitle text gets dropped from the front record's subtitle. It's marked with a `shortcut:` comment.
   - Tests: 600 passing, tsc clean.

## Running tally rule

The user asked (2026-10-31) that **every change gets added to this write-up as it happens**, so it stays a running tally. When you change anything, add a row to the Progress table and a line under the user's requests (or the right section) in the same turn, and commit it with the change.

## What's left, in order

1. **Check the Player colour** in the dev build:
   - Set one in Settings → Appearance → the look editor, then dial through Index, Panels, Gatefold and Crate.
   - Also check liner notes at about 940px and 800px window heights.
2. **Task 9B, the release commit.** Done: 1.1.0 chosen by the user, release commit made on `layouts`. Next: the installed update test, then the user tags.
   - The user picks the version. My recommendation is **1.1.0**, since this is a feature release; the plan said "before 1.1", so they may want 1.0.x.
   - Bump `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `Cargo.lock`, as the 1.0.0 release commit did.
   - **What's New:** `LAYOUTS_RELEASE` in `src/lib/whats-new.ts` sits outside `WHATS_NEW` on purpose. At release:
     - Add `{ version, date, ...LAYOUTS_RELEASE }` at the top of `WHATS_NEW` and delete the constant.
     - Also mention liner notes and the Player colour.
   - **README:**
     - Add a changelog entry.
     - Mention the Player colour and liner notes.
     - Update "Make it yours", which still only says "Pick a look".
   - Run `npx vitest run`, `npx tsc --noEmit` and `cargo check`, then commit `release: <version>`.
   - **Stop there.**
3. **Release (user-run):**
   - Merge `layouts` → `main`.
   - Push main, then push tag `v<version>`; the tag push starts the build.
   - The user publishes the release.
4. **1.0.1-type fixes, still queued** (they could ride along in the release):
   - Done in 1.1.0: Ink look's sidebar "Sign in" button now uses `on-brand`.
   - The dev build writes the installed app's real data folders instead of `.dev` ones. Fixing this would make testing safe.
   - The website installer skips the bridge (see Part 1). The README note shipped in 1.1.0; detecting an un-updated Plus install is still open.
5. **Fork detach:** verify once GitHub Support finishes (see Part 1).
6. **Next projects:**
   - **A new logo**, its own brainstorm. The user asked for it.
   - **More looks**, as a content update before 1.1.
   - Roadmap ideas are in the README → Roadmap. Next up: sleep timer, remove duplicates, sort playlists by artist, and others.

## Parked minor leftovers (fine to ship)

- PlayerBar's video card remounts on a layout switch. Audio is unaffected.
- Duplicate Home shelf titles: Crate and the shelf page pick the first one.
- The Crate position resets when you leave Home.
- Muted text on a custom Player colour can dip below 4.5:1 contrast.
- The playlist page and the liner notes use different cache keys, so "Open the full record" refetches the first page.

## Incidents (be upfront about these)

- **Task 7 dev run:**
  - A builder played the user's Liked Music and reset `ytm-playback` without a backup.
  - The user's saved queue was lost; nothing was playing at the time.
  - It may have added a few plays to their YouTube history.
  - The user was told. Since then, every run backs up the full data folders.
- **Task 8:** a builder meant to play one track but clicked a playlist's Play. The data was restored and verified, but there may be a play or two in the history.

## State right now

- **A dev build is running.** It's a `pnpm tauri dev` background task, signed in with the user's account and live-reloading from `layouts`.
  - If HMR says "could not Fast Refresh", reload the window with `cdp.mjs eval "location.reload()"`.
- **Backup** taken just before it launched: `C:\Users\sdand\PorchlightDataBackup-20261031-1123`, holding the data folders plus `porchlight.reg` and `ytubic-plus.reg`.
- **When the user is done testing:**
  1. Stop the dev task, the debug `porchlight.exe`, and the Vite process on port 1420.
  2. `reg import` the two `.reg` files from the backup.
  3. Don't restore the data folders unless the user asks. They used the dev build as their real app, so their changes there are intentional.
- **Tests:** 600 passing, tsc clean.
