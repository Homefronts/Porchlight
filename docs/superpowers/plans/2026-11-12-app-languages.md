# App Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every string Porchlight writes itself can be shown in 14 languages, picked in Settings > General, switching at once in every window.

**Architecture:** A ~60-line house translator (`t(key, vars)`) over one JSON file per language in `src/locales/`, i18next-style layout, plurals via `Intl.PluralRules`, keys typed from `en.json`. The language preference is a persisted zustand store synced across windows. English is bundled; other languages load by dynamic import. Rust gets its tray and thumbbar strings from the frontend.

**Tech Stack:** React 19, TypeScript, zustand, Vite (`import.meta.glob`), vitest, Tauri 2 (Rust).

**Spec:** `docs/superpowers/specs/2026-11-12-app-languages-design.md`

## Global Constraints

- Languages, exactly: `en`, `es`, `pt-BR`, `fr`, `de`, `it`, `uk`, `ru`, `tr`, `id`, `hi`, `ja`, `ko`, `zh-CN`. Picker names (endonyms): English, Español, Português (Brasil), Français, Deutsch, Italiano, Українська, Русский, Türkçe, Bahasa Indonesia, हिन्दी, 日本語, 한국어, 简体中文.
- No new runtime dependency. No translation API.
- YouTube Music requests keep `hl: "en"` (`src/lib/innertube/shared.ts:58`); YouTube-sourced text, song/artist/album names and lyrics are not translated.
- Never translate: Porchlight, Rewind, look names (Sleeve, Paper, Ink liner, Ink, Classic), layout names (Sidebar, Gatefold, Index, Crate, Panels), Kugou, NetEase, LRCLIB, Musixmatch, Genius, YouTube Music, Last.fm, Libre.fm, ListenBrainz, Discord, SponsorBlock.
- No em dash (U+2014) or en dash (U+2013) in any locale file.
- English output of every moved string stays byte-identical; Classic look + Sidebar layout stays pixel-identical in English.
- Missing key in a language at runtime shows the English string, never the raw key.
- Tests: vitest node env, `// @vitest-environment jsdom` pragma for DOM tests, no JSX in test files.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave `src-tauri/Cargo.toml` line-ending noise out. Log every task in `docs/superpowers/handoffs/2026-10-31-full-project.md`.
- Subagents never launch the app on the user's real account (Task 11 is the controller's, with backup).
- Help link: `https://github.com/Homefronts/Porchlight/tree/main/src/locales`.
- From Task 4 on, any new UI string goes into `en.json` and, once Tasks 10 and 11 exist, into all 13 other files in the same commit. Record this as a standing rule in the handoff's hard rules at Task 12.

## Review Focus

1. **Plural edge counts** (0, 1, 2, 5, 11, 21, 1.5) in Russian/Ukrainian and in Japanese (one form only): the right form or `_other`, never a missing string. Pinned in Task 1.
2. **Odd system languages** (`""`, `"EN-us"`, `"pt"`, `"pt-PT"`, `"zh-Hant-TW"`, `"de-AT"`, `"xx"`): resolve to a supported language or English, never throw. Pinned in Task 1.
3. **A translation that drops or renames a `{blank}`** or adds a dash: caught by the locale test before it ships. Pinned in Task 2.
4. **Switching language with the floating player open:** the floating player follows without a restart. Pinned in Task 2.
5. **`t()` called before a non-English file finishes loading** (first paint after launch, or right after switching): English shows, then the language, no blank or key. Pinned in Task 2.

---

## File Structure

- `src/lib/i18n/translate.ts`: pure core: `Lang`, `LANGS`, `LANG_NAMES`, `resolveLanguage`, `translate`. No React, no store.
- `src/lib/i18n/index.ts`: runtime: loaded dictionaries, `t`, `useT`, `getLocale`, `loadLanguage`.
- `src/lib/i18n/keys.ts`: `Key` type derived from `en.json`.
- `src/lib/i18n/apply.ts`: side-effect module imported from `main.tsx`: loads the language, sets `<html lang>`, sends Rust its strings (main window only).
- `src/lib/store/language.ts`: persisted preference, cross-window sync.
- `src/locales/<code>.json` (14 files), `src/locales/GLOSSARY.md`.
- `src-tauri/src/ui_strings.rs`: Rust string table + `set_ui_strings` command.

---

### Task 1: Translator core

**Files:**
- Create: `src/lib/i18n/translate.ts`, `src/lib/i18n/translate.test.ts`, `src/locales/en.json` (seed: `{ "common": { "ok": "OK" } }`)

**Interfaces:**
- Produces:
  - `type Lang = "en" | "es" | "pt-BR" | "fr" | "de" | "it" | "uk" | "ru" | "tr" | "id" | "hi" | "ja" | "ko" | "zh-CN"`
  - `const LANGS: readonly Lang[]` (order above), `const LANG_NAMES: Record<Lang, string>` (endonyms from Global Constraints)
  - `type Dict = { [k: string]: string | Dict }`
  - `type Vars = Record<string, string | number>`
  - `resolveLanguage(pref: "system" | Lang, navigatorLanguage: string): Lang`
  - `translate(dict: Dict | undefined, fallback: Dict, lang: Lang, key: string, vars?: Vars): string`

- [ ] **Step 1: Write the failing tests** in `translate.test.ts`:
  - `resolveLanguage("de", "fr-FR")` → `"de"` (explicit pick wins).
  - system: `"de-AT"`→`"de"`, `"EN-us"`→`"en"`, `"pt"`→`"pt-BR"`, `"pt-PT"`→`"pt-BR"`, `"zh-Hant-TW"`→`"zh-CN"`, `"zh"`→`"zh-CN"`, `"ja-JP"`→`"ja"`, `"xx"`→`"en"`, `""`→`"en"`.
  - `translate(fr, en, "fr", "a.b")` returns fr's `a.b`; when fr lacks it returns en's; when `dict` is `undefined` returns en's; when both lack it returns the key.
  - `{name}` filled from vars; a `{blank}` with no var stays as `{blank}`; numbers render with `String(n)`.
  - plurals: en `{ n_one: "{count} song", n_other: "{count} songs" }`: count 1 → "1 song", 0 and 2 → "… songs".
  - ru `{ n_one, n_few, n_many, n_other }`: 1→one, 2→few, 5→many, 11→many, 21→one, 1.5→other.
  - ja `{ n_other: "{count}曲" }`: count 1 → "1曲".
  - plural key missing the needed category falls back to `_other` in the same language, then to English's form.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/i18n/translate.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `translate.ts`.** Lookup walks dotted path. When `vars.count` is a number and `key` is not itself a string leaf, pick `key_${new Intl.PluralRules(lang).select(count)}`, then `key_other`, then the same in `fallback` with `new Intl.PluralRules("en")`. Interpolate with `/\{(\w+)\}/g`.

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(i18n): translator core`.

---

### Task 2: Runtime, language store, locale checks

**Files:**
- Create: `src/lib/i18n/index.ts`, `src/lib/i18n/keys.ts`, `src/lib/i18n/apply.ts`, `src/lib/store/language.ts`, `src/lib/store/language.test.ts`, `src/locales/locales.test.ts`, `src/lib/i18n/index.test.ts`
- Create: the other 13 locale files as `{}` (so the glob and tests have them)
- Modify: `src/main.tsx` (add `await import("./lib/i18n/apply")` before the `App` render, next to the theme import)

**Interfaces:**
- Consumes: Task 1's `Lang`, `LANGS`, `resolveLanguage`, `translate`, `Dict`, `Vars`.
- Produces:
  - `useLanguageStore`: `{ language: "system" | Lang; setLanguage(l: "system" | Lang): void }`, persist name `"ytm-language"`, with the `storage` listener + `persist.rehydrate()` pattern from `src/lib/store/layout.ts:90-97`.
  - `type Key` in `keys.ts`: every leaf path of `en.json` as a dotted string, with `_one|_two|_few|_many|_other|_zero` suffixes stripped.
  - `t(key: Key, vars?: Vars): string` (works outside React; reads current state).
  - `useT(): (key: Key, vars?: Vars) => string` (re-renders on language change and when a file finishes loading).
  - `getLocale(): Lang` (the resolved language; use for every `toLocale*`/`Intl` call).
  - `loadLanguage(lang: Lang): Promise<void>` via `import.meta.glob("../../locales/*.json")`; `en` imported statically.
  - `onLanguageChange(cb: (lang: Lang) => void): () => void` (used by `apply.ts` and Task 9).

- [ ] **Step 1: Write failing tests.**
  - `locales.test.ts` (reads every `src/locales/*.json` with `fs`): for each non-empty language, base keys (plural suffix stripped) equal `en`'s base keys both ways; each plural base key has exactly the categories in `new Intl.PluralRules(code).resolvedOptions().pluralCategories`; every `{blank}` set in an `en` string appears in the translation and none extra; no value contains `—` or `–`; every file parses. Empty `{}` files are skipped by the parity checks (they are filled in Tasks 10 and 11) but a test asserts all 14 files exist.
  - `language.test.ts`: default is `"system"`; writing `{"state":{"language":"de"},"version":0}` to `localStorage["ytm-language"]` and dispatching a `StorageEvent` with that key makes the store read `"de"` (jsdom pragma).
  - `index.test.ts`: with the store set to `"fr"` and fr not loaded yet, `t("common.ok")` returns English; after `await loadLanguage("fr")` with a mocked fr dict it returns French; `getLocale()` follows `resolveLanguage`.

- [ ] **Step 2: Run** `pnpm vitest run src/locales src/lib/store/language.test.ts src/lib/i18n`. Expected: FAIL.

- [ ] **Step 3: Implement** the store, `keys.ts`, `index.ts`, and `apply.ts` (on start and on change: `loadLanguage`, then `document.documentElement.lang = lang`). `useT` can subscribe with `useSyncExternalStore` on a version counter bumped by language change and file load.

- [ ] **Step 4: Run** the tests, then `pnpm tsc --noEmit`. Expected: PASS, clean.

- [ ] **Step 5: Commit** `feat(i18n): runtime, language store and locale checks`.

---

### Task 3: Language picker, help link, locale-aware formatting

**Files:**
- Modify: `src/components/settings/general-tab.tsx` (new first `SettingRow`), `src/lib/format.ts`, `src/components/rewind/slides.tsx:120`, `src/routes/rewind.tsx:75`, `src/components/rewind/listening-history-group.tsx:33`, `src/locales/en.json`
- Test: `src/lib/format.test.ts` (create if absent)

**Interfaces:**
- Consumes: `useLanguageStore`, `LANGS`, `LANG_NAMES`, `useT`, `getLocale`, `t`.

- [ ] **Step 1: Write failing tests** in `format.test.ts`: with language `"de"`, `formatDateTime(Date.UTC(2026,10,12,15,42))` contains `"12.11.2026"` or `"12. Nov"` (German order); with `"en"` the output equals `new Date(…).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })`; `formatRelative` for 3 h ago returns `t("time.hoursAgo", { count: 3 })` and is `"3h ago"` in English (byte-identical to today).
- [ ] **Step 2: Run** `pnpm vitest run src/lib/format.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `format.ts` and the three `toLocaleString()` sites pass `getLocale()`; `formatRelative`'s English pieces become keys `time.justNow`, `time.minutesAgo`, `time.hoursAgo`, `time.daysAgo` with `{count}`. The picker row: icon `IconLanguage` from tabler, title key `settings.general.language.title` ("Language"), description `settings.general.language.description` ("Porchlight's own text. Music from YouTube stays as it is."), control a `Select` from `src/components/ui` (whatever the other tabs use) with "System default" (`settings.general.language.system`) then `LANG_NAMES` in `LANGS` order, each option `lang={code}`. Under it a small link "Help improve this translation" (`settings.general.language.help`) opening the help URL with the same opener the About section uses.
- [ ] **Step 4: Run** tests and `pnpm tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(i18n): language picker and locale-aware dates and numbers`.

---

### Tasks 4 to 8: Move the strings, area by area

Same steps for each. Every string the area renders or announces moves into `en.json` under the area's top-level key, with the English text unchanged, and the code calls `useT()` in components or `t()` in plain `.ts`. Includes `aria-label`, `title`, `placeholder`, `alt` on our own images, `description` props, toasts, thrown error messages shown to the user, and copy in data tables. Plural phrasings ("3 songs") become `_one`/`_other` keys with `{count}`. Leave alone: YouTube-sourced text, names on the never-translate list, CSS class names, test ids, log messages, keys sent to Rust or YouTube.

- [ ] **Step 1:** Run `pnpm vitest run` and record the count; snapshot nothing new.
- [ ] **Step 2:** Move the area's strings.
- [ ] **Step 3:** Audit: `grep -nE '>[^<>{}]*[A-Za-z]{3,}[^<>{}]*<|(aria-label|title|placeholder|description)="[^"]*[A-Za-z]' <area files>` shows only non-translatable hits; list any you kept and why in the report.
- [ ] **Step 4:** `pnpm vitest run`, `pnpm tsc --noEmit`, `pnpm eslint <touched files>`. Expected: same pass count plus none failing, clean. Existing tests that assert English text keep passing unchanged (that is the byte-identical check).
- [ ] **Step 5: Commit** `refactor(i18n): move <area> strings into en.json`.

| Task | Area | Top-level key | Files |
|---|---|---|---|
| 4 | App shell and player | `shell`, `player` | `src/components/layout/**` (incl. `shells/**`, lyrics view, consent notice, floating player), `src/routes/__root.tsx` |
| 5 | Settings and looks | `settings`, `looks` | `src/components/settings/**`, `src/components/theme/**`, `src/lib/theme/looks.ts`, `layouts.ts` (descriptions only; names stay) |
| 6 | Pages | `pages` | `src/routes/*.tsx` except `__root`, `src/components/podcasts/**`, `src/components/rewind/**` |
| 7 | Shared components and toasts | `common`, `toast`, `errors` | `src/components/shared/**`, `src/components/ui/**` (only our copy), toast and user-facing error strings in `src/lib/**` |
| 8 | What's New | `whatsNew` | `src/lib/whats-new.ts` + its dialog: each entry's `summary`, change `title` and `text` become `whatsNew.v<version with _>.summary`, `.changes.<i>.title`, `.changes.<i>.text`; `date` becomes ISO `YYYY-MM-DD`, rendered with `Intl.DateTimeFormat(getLocale(), …)` in options that reproduce today's English strings exactly (add a test comparing all 32 English dates to the old values). `whats-new.test.ts` keeps passing. |

---

### Task 9: Rust tray and taskbar strings

**Files:**
- Create: `src-tauri/src/ui_strings.rs`
- Modify: `src-tauri/src/lib.rs` (`mod ui_strings;`, register `ui_strings::set_ui_strings` in `generate_handler!` at ~4446, `build_tray` at 4326 keeps its `MenuItem` handles in managed state so their text can change), `src-tauri/src/thumbbar.rs` (labels at ~443-475 come from `ui_str`), `src/lib/i18n/apply.ts`, `src/locales/en.json` (`native.*` keys)

**Interfaces:**
- Produces (Rust): `pub fn ui_str(key: &str, default: &str) -> String`; `#[tauri::command] pub fn set_ui_strings(app: tauri::AppHandle, strings: std::collections::HashMap<String, String>)` stores the map, calls `MenuItem::set_text` on the tray items, and refreshes the thumbbar.
- Keys (all under `native.` in `en.json`, values = today's English): `tray.show` "Show Porchlight", `tray.playPause` "Play / Pause", `tray.previous` "Previous", `tray.next` "Next", `tray.quit` "Quit", `thumb.previous`, `thumb.next`, `thumb.play`, `thumb.pause`, `thumb.shuffleOn` "Shuffle: on", `thumb.shuffleOff` "Shuffle: off", `thumb.repeatOff` "Repeat: off", `thumb.repeatAll` "Repeat: all", `thumb.repeatOne` "Repeat: one", `thumb.like`, `thumb.unlike` (copy the exact current English from `thumbbar.rs`). The map sent to Rust uses the keys without the `native.` prefix.

- [ ] **Step 1: Write the failing Rust test** in `ui_strings.rs`: `ui_str("tray.quit", "Quit")` is `"Quit"` before any set; after storing `{"tray.quit": "Beenden"}` it is `"Beenden"`; an unknown key returns its default.
- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml ui_strings`. Expected: FAIL.
- [ ] **Step 3: Implement** (a `OnceLock<RwLock<HashMap<..>>>` is enough). In `apply.ts`, only when `!isFloatingPlayerWindow()`, on start and on every language change, `invoke("set_ui_strings", { strings })` with the `native.*` values from `t`.
- [ ] **Step 4: Run** cargo tests and `pnpm tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(i18n): translated tray and taskbar buttons`.

---

### Task 10: Glossary and the first seven translations

**Files:**
- Create: `src/locales/GLOSSARY.md`; fill `es.json`, `pt-BR.json`, `fr.json`, `de.json`, `it.json`, `tr.json`, `id.json`

- [ ] **Step 1:** Write `GLOSSARY.md`: the never-translate list (Global Constraints), and for each language one fixed rendering of: Settings, Library, Queue, Home, Explore, Search, Downloads, Podcasts, Liked songs, Play, Pause, Shuffle, Repeat, Lyrics, Look, Layout. Note per language: formal or informal "you" (pick the form the platform's own apps use: `es` tú, `pt-BR` você, `fr` vous, `de` du, `it` tu, `tr` sen, `id` Anda).
- [ ] **Step 2:** Translate `en.json` into each file, all keys, following the glossary, keeping `{blanks}`, using the plural categories each language needs, no em or en dashes.
- [ ] **Step 3:** `pnpm vitest run src/locales`. Expected: PASS for all seven.
- [ ] **Step 4: Commit** `feat(i18n): es, pt-BR, fr, de, it, tr and id translations`.

### Task 11: The other six translations

Same as Task 10 for `uk`, `ru`, `hi`, `ja`, `ko`, `zh-CN` (glossary entries added for them; `uk`/`ru` informal "ти"/"ты", `hi` आप, `ja` polite です/ます, `ko` 해요체, `zh-CN` 你). Commit `feat(i18n): uk, ru, hi, ja, ko and zh-CN translations`.

---

### Task 12: Fonts, layout pass and live check (controller, with the user's data backed up)

**Files:**
- Modify: `src/index.css` (append script fallbacks to the end of each font stack: `"Segoe UI", "Nirmala UI", "Yu Gothic UI", "Malgun Gothic", "Microsoft YaHei UI", sans-serif`; after the existing Latin fonts so English rendering is unchanged), plus whatever spots need `truncate`/`min-w-0`.

- [ ] **Step 1:** Back up user data per the handoff rules, launch the dev build (run-app skill).
- [ ] **Step 2:** English, Classic + Sidebar: app-only screenshots of Home, Settings > General, the player; compare with screenshots taken before Task 4 (take them first if missing). Expected: identical.
- [ ] **Step 3:** German, then Russian: walk Home, Explore, Search, Library, Podcasts, Downloads, Rewind, every Settings tab, the player in each layout, the floating player, What's New, Make it yours, a toast. Fix every clip, overflow or wrap into the layout; commit fixes.
- [ ] **Step 4:** Russian, Hindi, Japanese in every look: no tofu boxes, no default-serif fallback where the look is sans.
- [ ] **Step 5:** Switch language with the floating player open; check it follows. Check the tray menu and taskbar buttons in German.
- [ ] **Step 6:** Restore data, verify counts. Commit `fix(i18n): layout and font pass`. Update README (Features bullet, remove the roadmap item) and the handoff log.
