# Themes, Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give YTubic Plus its own look (Liner notes) across every screen, with five built-in looks, editable custom looks, theme file export/import, and a first-launch "Make it yours" picker that previews all five layouts.

**Architecture:** A look is plain data (seed colours, fonts, shapes, touches). A pure function derives the app's existing CSS variables from it, and one applier writes them to `<html>` in both windows. Classic writes nothing, so today's tokens, `next-themes` and the ambient background run unchanged. The polish pass then moves components onto three typography roles and four small "touch" components that read the active look, so every screen follows any look.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@theme inline` in `src/index.css`), zustand `persist`, `next-themes`, fontsource, vitest; Tauri 2 (`tauri-plugin-dialog` already used by `save_png`).

**Spec:** `docs/superpowers/specs/2026-10-27-themes-design.md` (mockups in `2026-10-27-themes-mockups/`, `first-launch-v2.html` is the reference for the picker).

## Global Constraints

- Release 1 ships the **Sidebar** layout only. Gatefold, Index, Crate and Panels exist only as preview miniatures labelled "later update".
- Looks: **Sleeve** (new-install default), **Paper**, **Ink liner**, **Ink**, **Classic**. Seed values are the ones in `first-launch-v2.html`'s `PRESETS`.
- **Classic** is today's app pixel for pixel, with its light / dark / system switch and ambient background. Applying Classic removes every override.
- Updaters from 0.8.x see the picker once with **Classic** preselected; nothing changes unless they choose. New installs: **Sleeve + Sidebar**.
- Every look reaches every screen, including context menus, dialogs, toasts, tooltips, Settings, lyrics, Rewind, the full-screen and floating players and the picker itself.
- Built-in looks never change; any edit creates a custom look ("Sleeve, edited"). Imports sit with custom looks. Custom looks can be renamed and deleted.
- Theme files are JSON data only: no CSS, no URLs, no code. Colours must parse as `#rgb`/`#rrggbb`; everything else is an enum, a bounded number, or a boolean.
- Fonts are bundled (Instrument Serif, Archivo, JetBrains Mono; Inter already bundled). Nothing is fetched at runtime.
- UI copy: no em or en dashes (house rule from `src/lib/whats-new.ts`).
- vitest only runs `src/**/*.test.ts` in a node environment; DOM tests need `// @vitest-environment jsdom`, no JSX in tests; stub `localStorage` with `vi.hoisted` where stores are imported (see `src/lib/ai/use-ai-hooks.test.ts`).
- Line endings: edit preserving each file's existing endings; check `git diff --stat` shows only intended lines.
- Run the app with the `run-app` project skill (`.claude/skills/run-app/`) for every visual check; close the installed Plus first.

## Review Focus

1. A hand-edited or hostile theme file (colour `"red; background:url(http://x)"`, 10 MB name, unknown version) must import nothing harmful: rejected or clamped, with a plain message. Test in Task 4.
2. A custom look with unreadable text (text colour equal to background) should still be usable: the editor warns under 3:1 contrast and Settings stays reachable. Test in Task 1 (`contrastRatio`) and checked in Task 12.
3. Switching from Classic (light mode) to Sleeve and back must restore Classic's light mode and ambient background exactly. Test in Task 2.
4. The floating player must restyle live when the look changes in the main window. Checked in Task 2 (cross-window rehydrate test) and Task 9.
5. An updater who closes the picker without choosing keeps Classic and is not asked again. Test in Task 2 (`initialLookFor`).

---

### Task 1: Look model and token derivation

**Files:**
- Create: `src/lib/theme/looks.ts`, `src/lib/theme/tokens.ts`
- Test: `src/lib/theme/tokens.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LayoutId = "sidebar" | "gatefold" | "index" | "crate" | "panels";
  export type FontRole = "headline" | "display" | "meta" | "body";
  export type FontId = "instrument-serif" | "archivo" | "jetbrains-mono" | "inter" | "system";
  export type Seeds = { bg: string; fg: string; acc: string; dim: string; faint: string; line: string };
  export type Touches = { vinyl: boolean; numbers: boolean; uppercase: boolean; offsetShadows: boolean; tapeCounter: boolean; textTransport: boolean };
  export type Look = {
    id: string; name: string; base: BuiltInId; mode: "light" | "dark";
    seeds: Seeds; fonts: Record<FontRole, FontId>;
    radius: { window: number; cover: number; button: number }; // px, 0-24
    touches: Touches;
  };
  export type BuiltInId = "sleeve" | "paper" | "ink-liner" | "ink" | "classic";
  export const BUILT_IN_LOOKS: Record<BuiltInId, Look>;
  export const CLASSIC_ID: "classic";
  export function deriveTokens(look: Look): Record<string, string>; // keys are CSS custom property names, e.g. "--background"
  export function contrastRatio(a: string, b: string): number;
  ```

- [ ] **Step 1: Write the failing tests** in `tokens.test.ts`:
  - `deriveTokens(BUILT_IN_LOOKS.sleeve)["--background"] === "#0e0d0c"` and `["--foreground"] === "#ece6da"` and `["--brand"] === "#ff3b5c"`.
  - For every non-Classic built-in, the result has every variable name declared under `.dark` in `src/index.css` (read the file in the test, collect `--name:` inside the `.dark { … }` block) so no token is left at Classic's value.
  - `deriveTokens(BUILT_IN_LOOKS.classic)` returns `{}`.
  - `contrastRatio("#000000", "#ffffff")` is `21` (to 1 decimal); `contrastRatio("#777777", "#777777")` is `1`.
  - Every non-Classic built-in has `contrastRatio(fg, bg) >= 7` and `contrastRatio(dim, bg) >= 4.5`.
- [ ] **Step 2:** Run `node_modules/.bin/vitest run src/lib/theme/tokens.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `looks.ts` with the five built-ins, seed values copied from `first-launch-v2.html` `PRESETS` (Classic gets seeds there too, used only by previews and as the base of edited copies). Implement `deriveTokens` in `tokens.ts`: map seeds onto the shadcn tokens, the `--t1..--t10` text ramp (interpolate fg→faint), `--w020..--w350` (fg at the matching alpha), `--acc1..--acc5` (acc and lighter/darker steps), sidebar and full-screen tokens; add `--font-headline`, `--font-display`, `--font-meta`, `--font-body`, `--radius-window`, `--radius-cover`, `--radius-button`. `contrastRatio` is WCAG relative luminance.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat(theme): look model and token derivation`.

### Task 2: Look store, applying it, and the update path

**Files:**
- Create: `src/lib/theme/store.ts`, `src/lib/theme/apply.ts`
- Modify: `src/main.tsx` (import `./lib/theme/apply` next to `./lib/interface-font`), `src/App.tsx` and `src/components/layout/floating-player-app.tsx` (`ThemeProvider forcedTheme` when a non-Classic look is active), `src/components/layout/app-shell.tsx:239` (ambient background only when Classic)
- Test: `src/lib/theme/store.test.ts`

**Interfaces:**
- Consumes: `Look`, `BUILT_IN_LOOKS`, `deriveTokens`, `CLASSIC_ID` (Task 1).
- Produces:
  ```ts
  type ThemeState = {
    activeId: string; layout: LayoutId; custom: Look[]; pickerSeen: boolean;
    setActive(id: string): void; saveCustom(look: Look): string; // returns id
    renameCustom(id: string, name: string): void; deleteCustom(id: string): void;
    markPickerSeen(): void;
  };
  export const useThemeStore; // zustand persist, name "ytm-looks"
  export function activeLook(s: Pick<ThemeState, "activeId" | "custom">): Look; // unknown id -> classic
  export function initialLookFor(hadPreviousInstall: boolean): BuiltInId; // true -> "classic", false -> "sleeve"
  export function useActiveLook(): Look;
  export function applyLook(look: Look, root?: HTMLElement): void; // in apply.ts
  ```

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`):
  - `initialLookFor(true) === "classic"`, `initialLookFor(false) === "sleeve"`.
  - `activeLook({ activeId: "nope", custom: [] }).id === "classic"`.
  - `deleteCustom` of the active custom look sets `activeId` back to that look's `base`.
  - `applyLook(sleeve)` then `applyLook(classic)` leaves `document.documentElement.style.length === 0` and no `data-look` attribute (Review Focus 3).
  - `applyLook(sleeve)` sets `data-look="sleeve"` and `data-touch-vinyl="on"`.
  - A `storage` event with key `ytm-looks` rehydrates the store (Review Focus 4).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. "Had a previous install" = `localStorage.getItem("ytm-settings") !== null` at first store creation. `apply.ts` subscribes to the store and calls `applyLook` on change in whichever window loads it.
- [ ] **Step 4:** Run tests and `node_modules/.bin/tsc --noEmit`. Expected: PASS, no errors.
- [ ] **Step 5:** Commit `feat(theme): look store and applier`.

### Task 3: Fonts and typography roles

**Files:**
- Modify: `package.json` (add `@fontsource/instrument-serif`, `@fontsource-variable/archivo`, `@fontsource-variable/jetbrains-mono`), `src/lib/interface-font.ts` (import them; Classic keeps the Interface font setting, other looks use their `fonts`), `src/index.css` (`@theme inline`: `--font-headline`, `--font-display`, `--font-meta` with Classic fallbacks to `var(--app-font)`)
- Test: extend `src/lib/theme/tokens.test.ts`

**Interfaces:**
- Produces: Tailwind utilities `font-headline`, `font-display`, `font-meta`; `.look-case` (uppercase when `data-touch-uppercase="on"`). Font stacks: `FONT_STACKS: Record<FontId, string>` exported from `src/lib/theme/looks.ts`.

- [ ] **Step 1:** Test: `deriveTokens(sleeve)["--font-headline"]` contains `Instrument Serif`; Ink's contains `Inter`.
- [ ] **Step 2:** Run. FAIL.
- [ ] **Step 3:** Add the packages (`pnpm add …`), stacks and theme entries.
- [ ] **Step 4:** Run tests; launch with run-app, apply Sleeve from DevTools (`useThemeStore.getState().setActive("sleeve")`), screenshot: headings change only where roles are used (none yet), and the network tab shows no font requests.
- [ ] **Step 5:** Commit `feat(theme): bundled fonts and typography roles`.

### Task 4: Theme files

**Files:**
- Create: `src/lib/theme/file.ts`
- Modify: `src-tauri/src/lib.rs` (new `save_text_file(contents: String, name: String, filter_name: String, ext: String) -> Result<bool, String>` beside `save_png`, registered in the handler list)
- Test: `src/lib/theme/file.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const THEME_FILE_VERSION = 1;
  export type ThemeFile = { ytubicPlusTheme: 1; name: string; author?: string; layout: LayoutId; look: Omit<Look, "id"> };
  export function toThemeFile(look: Look, layout: LayoutId, author?: string): string; // JSON, 2-space indent
  export type ParseResult = { ok: true; look: Look; layout: LayoutId; notes: string[] } | { ok: false; error: string };
  export function parseThemeFile(text: string): ParseResult;
  ```

- [ ] **Step 1: Write the failing tests:**
  - Round trip: `parseThemeFile(toThemeFile(sleeve, "sidebar"))` gives `ok: true` with equal seeds, fonts, radius, touches.
  - Colour `"red; background:url(http://x)"` falls back to the base look's value and adds a note (Review Focus 1).
  - Text over 1 MB, invalid JSON, or missing `ytubicPlusTheme` gives `ok: false` with a one-line `error`.
  - `ytubicPlusTheme: 2` gives `ok: false`, error mentions updating the app.
  - Layout `"crate"` imports with `layout: "sidebar"` and a note "This look was made for the Crate layout, which arrives in a later update."
  - Name longer than 60 characters is cut to 60; radius 999 clamps to 24; unknown keys are ignored.
- [ ] **Step 2:** Run. FAIL.
- [ ] **Step 3:** Implement; colours match `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`.
- [ ] **Step 4:** Run tests and `cargo check` in `src-tauri`. PASS.
- [ ] **Step 5:** Commit `feat(theme): theme file export and import`.

### Task 5: Touch components

**Files:**
- Create: `src/components/theme/section-label.tsx`, `vinyl.tsx`, `tape-counter.tsx`, `transport-label.tsx`
- Modify: `src/index.css` (styles keyed on `[data-touch-*]` and `[data-look]`)

**Interfaces:**
- Consumes: `useActiveLook()` (Task 2).
- Produces:
  - `<SectionLabel side?: "A" | "B" | … index?: number>{title}</SectionLabel>`: a ruled mono label ("SIDE A · LISTEN AGAIN", count on the right) when `numbers` is on; today's section heading otherwise.
  - `<TrackNumber value="A1" />`: renders nothing when `numbers` is off.
  - `<Vinyl className />`: the record peeking out from behind a cover; nothing when `vinyl` is off.
  - `<TapeCounter current total onSeek />`: `01:13 ━━○── 03:36` when `tapeCounter` is on, else renders the existing slider unchanged.
  - `<TransportLabel kind="prev" | "play" | "pause" | "next" | "shuffle" | "repeat" />`: text ("◂◂ PREV") when `textTransport` is on, else the current icon.
- [ ] **Step 1:** Wire each component into one real spot first (SectionLabel on Home's first shelf, TapeCounter and TransportLabel in the side card, Vinyl behind the first Listen again cover); run-app screenshots under Sleeve and Classic. Classic must look identical to today.
- [ ] **Step 2:** Commit `feat(theme): liner-notes touch components`.

### Tasks 6–10: The polish pass

Each task moves one area onto the typography roles (`font-headline` for page titles and big serif moments, `font-display` + `look-case` for item titles, `font-meta` for labels, counts, durations, menus' shortcut text), uses `--radius-cover` / `--radius-button` for covers and buttons, and swaps in the Task 5 touches where the element exists. **Rule for every task:** under Classic, a before/after screenshot pair must match; under Sleeve and Paper, the area must match the mockups' language. Each task ends with: run-app screenshots of the area in Classic, Sleeve, Paper and Ink → look at them → commit `style(theme): <area>`.

- **Task 6: Shell.** `src/components/layout/app-sidebar.tsx` (logo set as the two-line "YTUBIC / PLUS." in Liner looks, `▸` active marker, playlist list in `font-meta`), `top-bar.tsx`, `app-shell.tsx`, `layout-resize-handle.tsx`.
- **Task 7: Home and browsing.** `src/routes/index.tsx` (greeting "Good evening, <name>." in `font-headline`), `src/components/shared/feed-view.tsx`, `shelf-card.tsx` and the shelf/section headers (`SectionLabel` with Side A, Side B…; `TrackNumber` A1, A2…; `Vinyl` behind the most recently played item), `src/routes/explore.tsx`, `charts.tsx`, `moods.tsx`, `moods_.$id.tsx`, `new-releases.tsx`, `browse.$id.tsx`, `search.tsx`, `library.tsx`, `downloads.tsx`, `downloads_.$id.tsx`.
- **Task 8: Entity pages.** `src/components/layout/entity-page-header.tsx`, `src/components/shared/track-list.tsx` (numbers and durations in `font-meta`), `src/routes/playlist.$id.tsx`, `album.$id.tsx`, `artist.$id.tsx`.
- **Task 9: Players and lyrics.** `src/components/layout/player-bar.tsx` (side card: "● NOW PLAYING" label, `TapeCounter`, `TransportLabel`, Up Next as a back-cover tracklist in `font-meta`), `player-bar-bottom.tsx`, `floating-player-app.tsx` (must follow look changes live), `fullscreen-player.tsx`, `lyrics-view.tsx` (lines in `font-headline`, active line `--foreground`, others `--t*`).
- **Task 10: Shared UI, Settings and Rewind.** `src/components/ui/*` (dropdown-menu, context-menu, dialog, popover, tooltip, sonner, switch, slider, segmented, tabs, input, button: radii from tokens, labels in `font-meta` where they are metadata), `src/components/settings/*`, `src/components/rewind/*` (Rewind keeps its art-coloured slides; only chrome and type follow the look), `src/components/layout/about-dialog.tsx`, What's New dialog.

### Task 11: Layout miniatures

**Files:**
- Create: `src/components/theme/miniatures/{sidebar,gatefold,index,crate,panels}.tsx`, `src/components/theme/look-preview.tsx`

**Interfaces:**
- Consumes: `Look`, `deriveTokens`, `LayoutId`.
- Produces: `<LookPreview look: Look layout: LayoutId sample: PreviewSample />` where `type PreviewSample = { name: string; covers: string[] /* image URLs or "" */; playlists: string[]; nowPlaying: { title: string; artist: string; cover: string } }`, and `placeholderSample(look: Look): PreviewSample` (generated gradient covers in the look's colours, generic titles, no third-party art).
- The preview scopes `deriveTokens(look)` to its own root `style`, so it shows any look without changing the app. Classic + Sidebar draws the Classic miniature (no screenshot). Layouts other than Sidebar show the pill "PREVIEW · COMES IN A LATER UPDATE".
- [ ] **Step 1:** Port the five templates from `first-launch-v2.html` to components using the token names from Task 1.
- [ ] **Step 2:** run-app: render `LookPreview` for every look × layout (25 combinations) on a scratch page; screenshot; check none is broken or unreadable.
- [ ] **Step 3:** Commit `feat(theme): layout preview miniatures`.

### Task 12: Look editor

**Files:**
- Create: `src/components/theme/look-editor.tsx`, `src/components/theme/colour-row.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 11.
- Produces: `<LookEditor value: { look: Look; layout: LayoutId } onChange(next) compact?: boolean />`: Look cards (built-ins, then a "Yours" row of custom looks), Layout cards (Sidebar selectable; others selectable for preview with "LATER UPDATE"), Colours (six rows, each with picker and "default"/"reset" against the built-in base), Advanced drawer (headline/title/detail font, window/cover/button radius sliders, the six touches as switches). The first edit to a built-in produces a draft named "<Base>, edited"; committing calls `saveCustom`. Under 3:1 `contrastRatio(fg, bg)` the Colours section shows "Text may be hard to read" (Review Focus 2).
- [ ] **Step 1:** Build to match `first-launch-v2.html`'s left column; preview beside it with `LookPreview`.
- [ ] **Step 2:** run-app: change each colour, reset it, open Advanced, toggle each touch; screenshots.
- [ ] **Step 3:** Commit `feat(theme): look editor`.

### Task 13: First launch "Make it yours"

**Files:**
- Create: `src/components/theme/make-it-yours.tsx`
- Modify: `src/components/layout/app-shell.tsx` (show it when `!pickerSeen`)

**Interfaces:**
- Consumes: `LookEditor`, `LookPreview`, `useThemeStore`, `initialLookFor`.
- Produces: a full-window screen: heading "Make it yours.", lead "Pick a starting point. You can change any of this later in Settings > Appearance.", the editor, the preview, and **Continue**. Preselection from `initialLookFor`. Sample is the user's library when signed in (Listen again covers, sidebar playlists, current track), else `placeholderSample`. Continue or Esc calls `markPickerSeen()`; Esc keeps whatever is preselected (Review Focus 5). Not shown in the floating window.
- Before the picker, `src/components/theme/welcome.tsx` plays the Welcome sequence from the spec's "Welcome" section (copy fixed there; app name from one constant `APP_NAME` in `src/lib/app-name.ts`), skippable with a button or any key, text-only fade under `prefers-reduced-motion`.
- [ ] **Step 1:** run-app with `ytm-looks` cleared and `ytm-settings` present: the welcome plays (and can be skipped), then the picker shows Classic selected; press Esc; restart; picker does not show and the app is Classic.
- [ ] **Step 2:** run-app with all storage cleared: Sleeve preselected; Continue; app is Sleeve everywhere.
- [ ] **Step 3:** Commit `feat(theme): first-launch picker`.

### Task 14: Settings → Appearance

**Files:**
- Modify: `src/components/settings/appearance-tab.tsx` (a "Look" group at the top with `LookEditor compact`, plus Export, Import, Rename and Delete for custom looks; Theme / Ambient Background / Interface Font rows show only under Classic), `src/lib/store/settings.ts` (unchanged fields; no migration needed)

**Interfaces:**
- Consumes: Tasks 2, 4, 12. Export calls `invoke("save_text_file", { contents: toThemeFile(...), name: "<name>.ytubic-theme.json", filterName: "YTubic Plus theme", ext: "json" })`; Import uses a hidden `<input type="file" accept=".json">` like `listening-history-group.tsx:71`, then `parseThemeFile`, then `saveCustom`, then a toast listing `notes`.
- [ ] **Step 1:** run-app: export Sleeve, edit the file's name, import it, see it under "Yours", rename it, delete it; import the hostile file from Task 4's test and see the error toast.
- [ ] **Step 2:** Commit `feat(theme): looks in Settings`.

### Task 15: Release

**Files:** `src/lib/whats-new.ts`, `README.md` (Features and screenshots in Sleeve), version files as in the 0.8.1 release commit.
- [ ] **Step 1:** Full run-app tour in each look (Home, playlist, artist, search, settings, context menu, full-screen, floating, Rewind); fix anything off.
- [ ] **Step 2:** `node_modules/.bin/vitest run`, `node_modules/.bin/tsc --noEmit`, `cargo check`. All pass.
- [ ] **Step 3:** Commit `release: 0.9.0`, then follow the release memory (pull, push main, verify, tag, draft, publish on the user's word).
