# App languages: design

Date: 2026-11-12. Roadmap item "Multiple languages" (README, Later), added 2026-10-27 from requests in YTubic's GitHub issues.

## Intent

Porchlight is English only. Listeners who'd rather not use the app in English asked for it in other languages. The app's own text (screens, Settings, buttons, messages, notices, the tray) moves into one JSON file per language, so the app can be shown in 14 languages and a native speaker can fix or add a language by editing one file on GitHub.

Success: switch the language in Settings and every piece of text Porchlight writes itself is in that language, right away, in every window, with no layout broken in the longest language.

## Languages

English (`en`), Spanish (`es`), Brazilian Portuguese (`pt-BR`), French (`fr`), German (`de`), Italian (`it`), Ukrainian (`uk`), Russian (`ru`), Turkish (`tr`), Indonesian (`id`), Hindi (`hi`), Japanese (`ja`), Korean (`ko`), Simplified Chinese (`zh-CN`). None is right-to-left.

## Goals

- Every string Porchlight writes itself is translated: screens, Settings, buttons, `aria-label`s, `title`s, placeholders, toasts, empty states, dialogs (consent notice, Make it yours, What's New, including past entries), the tray menu and the taskbar thumbnail buttons.
- A language picker at the top of Settings > General: "System default" first (follows the Windows display language), then the 14 languages each named in its own language ("Deutsch", "日本語"). A change applies at once, no restart, and reaches the floating player window too.
- Dates and numbers follow the chosen language (`toLocaleString` and friends take the chosen locale; there are about 5 call sites, see `src/lib/format.ts`, `rewind/slides.tsx`, `routes/rewind.tsx`, `rewind/listening-history-group.tsx`).
- `<html lang>` follows the chosen language (screen readers, and CSS `text-transform` for Turkish dotted/dotless i).
- First translations of all 13 non-English languages are machine-made and ship together. A glossary keeps names as names (see Glossary).
- Settings shows a small "Help improve this translation" link to the language files on GitHub.
- Going forward, every new feature adds its strings to `en` and its machine translations to the other 13 in the same change. A test fails if any language file is missing a key that `en` has, or has one `en` doesn't (plural forms checked per language, see Settled below).

## Non-goals

- Text that comes from YouTube Music: shelf names ("Listen again"), type labels ("Song", "Video"), play and view counts, search suggestions. Requests keep `hl: "en"` (`src/lib/innertube/shared.ts:58`), because code reads those English labels (for example `src/lib/track-meta.ts`). Translating that is a separate, riskier project.
- Song titles, artist names, album names and lyrics (lyric translation already exists in Settings > Lyrics).
- GitHub release notes, the README, docs, the update feed.
- Error detail strings produced in Rust and shown inside a message (for example `invalid videoId: …`). The surrounding sentence is translated; the technical detail may stay English.
- Right-to-left support.
- A translation website (Weblate, Crowdin). The files are compatible with one if wanted later.

## Anti-goals (would make this a failure even if it works)

- A layout that breaks, overflows or clips a control in German or Russian (roughly 30% longer than English). Tight spots (title-bar chips, buttons, the layout picker, Settings rows, the player bar) must fit or truncate with "…", never wrap into the layout.
- Any change to how the Classic look + Sidebar layout looks in English (it stays pixel-identical to 1.0, a standing rule).
- A string left in English in a non-English language because it was missed in the move, other than the non-goals above.
- Translating names: looks (Sleeve, Paper, Ink liner, Ink, Classic), layouts (Sidebar, Gatefold, Index, Crate, Panels), Rewind, Porchlight, Kugou, NetEase, LRCLIB, Musixmatch, Genius, YouTube Music, Last.fm, Libre.fm, ListenBrainz, Discord, SponsorBlock.
- Em or en dashes in any language's UI copy (standing rule).

## Approaches considered

1. **A small house-made translator (chosen by the user).** About 60 lines: `t(key, vars)` reads the active language's JSON, fills `{name}` blanks, picks plurals with `Intl.PluralRules`. The language lives in a zustand store like the other settings. Keys are type-checked against `en`. No dependency. Files use i18next's JSON layout so switching to i18next later needs no rewrite of translations.
2. **i18next + react-i18next.** Standard, full-featured, about 40 KB; most features (network loading, namespaces, detection plugins) unused here, and its setup is more code than approach 1 in full.
3. **Lingui.** Extracts plain English from code at build time; adds a compiler plugin to Vite and makes every build and test depend on it.

Approach 1 was picked: Porchlight's text is labels, sentences with a blank or two, and a few plurals, which approach 1 covers fully with the least code, and the file layout keeps i18next open.

## How it works (decided)

- **Files:** `src/locales/<code>.json`, one per language. Nested keys grouped by area (`settings.lyrics.title`, `player.pause`, `toast.downloadFailed`). Blanks as `{name}`. Plurals in i18next form: `key_one`, `key_other` (plus `_few`, `_many` where `Intl.PluralRules` needs them, e.g. Russian and Ukrainian). `en.json` is the source of truth.
- **Types:** keys are typed from `en.json`, so `t("settigns.x")` fails `tsc`.
- **`t()` works everywhere:** in components (re-render on language change through a hook) and in plain `.ts` code such as toast calls and stores (reads the current language from the store at call time).
- **Missing key at runtime:** fall back to English, never show the raw key.
- **Language store:** a persisted zustand setting `language: "system" | <code>`, synced across windows with the same `storage` event + `persist.rehydrate()` pattern as `src/lib/store/layout.ts` and `lyrics-settings.ts`.
- **System language:** from `navigator.language`. Exact match first, then base language (`de-AT` → `de`, any `pt-*` → `pt-BR`, any `zh-*` → `zh-CN`), else English.
- **Loading:** English is bundled; the other languages are loaded with a dynamic `import()` when picked, so the app doesn't carry 14 languages up front. While loading, English shows.
- **Rust text:** the frontend sends translated strings to Rust (a new command) at startup and whenever the language changes; `lib.rs` tray menu items (`show`, `play_pause`, `prev`, `next`, `quit`) and `thumbbar.rs` button tooltips use them. Rust keeps English defaults until the first call. No translation system in Rust.
- **Glossary:** a short `src/locales/GLOSSARY.md` lists the names that are never translated and a few fixed choices per language (how "Settings", "Library", "Queue" are rendered) so machine translations stay consistent across files and future additions.
- **Fonts:** looks use bundled Latin fonts (Fontsource, Instrument Serif). Cyrillic, Devanagari, Japanese, Korean and Chinese text must fall back to a clean system font (Segoe UI, Nirmala UI, Yu Gothic UI, Malgun Gothic, Microsoft YaHei UI) rather than a default serif or tofu boxes. Each look is checked in at least Russian, Hindi and Japanese.
- **Order of work:** the translator, store, picker and tests come first with `en.json` alone; then strings move area by area into `en.json` (each move keeps English output identical); then the 13 machine translations; then the Rust strings; then the layout pass in German and Russian and the font pass.

## Settled after the builder check (Claude's calls, flagged for the user)

- **Scope of the move:** every user-visible string Porchlight writes, wherever it lives: JSX, `aria-label`/`title`/placeholder, toasts and errors thrown from `.ts` modules, and data tables (look and layout descriptions, Make it yours, What's New). Finding them is part of the work; there is no audit list. Rough size: ~145 `.tsx` files with ~400 inline texts and labels plus ~120 toast calls, plus data-driven copy. In Rust only the tray menu and the thumbbar tooltips are in scope.
- **What's New:** all 32 existing entries are translated, keyed per version (`whatsNew.v1_2_1.title`, `whatsNew.v1_2_1.items.0`, ...). Each future release adds its entry in all 14 languages as part of the release commit.
- **Who translates:** Claude writes the 13 machine translations in the build session, from `en.json` and the glossary, in batches by area. No translation API, no key, no new dependency. The checks: the key test below, every `{blank}` in `en` present in each translation, no em or en dashes, and the German/Russian layout pass. A language ships only complete.
- **Key test:** compares base keys (plural suffix stripped) both ways, and for plural keys checks each language has exactly the categories `new Intl.PluralRules(code).resolvedOptions().pluralCategories` lists (so Russian has `_one/_few/_many/_other`, Japanese only `_other`).
- **Rust strings:** only the main window sends them (the floating player doesn't). The main webview runs even when Porchlight starts hidden in the tray, so the tray is translated shortly after launch; English until then is accepted.
- **"Pixel-identical in English":** there is no visual-regression suite. Check by app-only CDP screenshots of Classic + Sidebar on Home, Settings and the player before and after the move, compared by eye; English output of every moved string must be byte-identical.
- **Dates and numbers:** formatted with the resolved supported language code (`de-AT` system → `de`), so formatting always matches the text.
- **Help link:** `https://github.com/Homefronts/Porchlight/tree/main/src/locales`.

## Constraints (standing project rules)

- No em or en dashes in UI copy, in any language.
- Classic + Sidebar stays pixel-identical in English.
- Respect `prefers-reduced-motion` (unaffected, but no new motion).
- Tests: vitest in node env, `// @vitest-environment jsdom` for DOM tests, no JSX in test files.
- Never take full-desktop screenshots; app-only CDP screenshots. Back up and restore user data around any dev app run.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; leave `src-tauri/Cargo.toml` line-ending noise out; log every change in `docs/superpowers/handoffs/2026-10-31-full-project.md`.
- HTML mockup before UI redesigns: the only new UI is the picker row and the help link in an existing Settings tab, which follows the existing row style, so no mockup unless the builder changes a layout.

## Left to the builder

- Key naming within the area grouping, and how files are split if one grows unwieldy.
- How `t()` handles rich text (a link or bold inside a sentence): a small helper is fine.
- Exactly which spots need `truncate` or `min-w-0` after the German/Russian pass.
- The command name and payload shape for sending Rust its strings.
- Whether a few long German labels get a shorter translation instead of truncation.
