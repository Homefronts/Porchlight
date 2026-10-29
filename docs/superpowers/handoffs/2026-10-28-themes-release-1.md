# Handoff: Themes release 1 (updated 2026-10-29)

For whoever picks this up next, human or AI. Read this file first, then the ledger.

## What this is

YTubic Plus is getting its own look ("Liner notes") plus a theme system: five built-in looks
(Sleeve, Paper, Ink liner, Ink, Classic), editable custom looks, theme file export/import, and a
first-launch "Make it yours" picker. Classic must stay the current app, pixel for pixel.

- Spec (binding authority): `docs/superpowers/specs/2026-10-27-themes-design.md`
- Mockups: `docs/superpowers/specs/2026-10-27-themes-mockups/` (`liner-v2.html` = Sleeve, `first-launch-v2.html` = picker and the PRESETS seeds)
- Plan (15 tasks): `docs/superpowers/plans/2026-10-27-themes-release-1.md`

## Where things stand

- Branch `themes-release-1`, branched from `main` at `2db5b76`. **Nothing on it is pushed.**
- **All 15 tasks are done and reviewed.**
- **The final whole-branch review is done**, and its fix wave (`05705b4`) passed a scoped re-review. It fixed:
  - 0.8.x users who never changed a setting being treated as new installs
  - the picker saving a later-update layout
  - the floating window showing "Nothing playing" for a restored track
  - four minors
- **The release commit `release: 0.9.0` (`c7779c6`) exists locally.** Nothing is pushed or tagged.
- **Left (all the user's call):**
  - Decide 0.9.0 vs 1.0.
  - Check a real 0.8.1 profile: it should get the updater Welcome note and stay on Classic.
  - Merge to main or open a PR, then push main, then tag. Pushing the tag starts the release build.
  - Reinstall or re-point the URL schemes, and reopen the installed app.

### What each task built (commits)

| Task | What | Commits |
|---|---|---|
| 1 | Look model, token derivation, `FONT_STACKS` | `93894ed` |
| 2 | Look store (`ytm-looks`), applier, updater path, forced light/dark consumers | `c17b8a8`, `3d07086` |
| 3 | Bundled fonts, `font-headline/display/meta`, `.look-case` | `da0b49d` |
| 4 | Theme file export/import (hostile-input safe), Rust `save_text_file` | `e32b248`, `6372b09` |
| 5 | Touch components: SectionLabel, TrackNumber, Vinyl, TapeCounter, TransportLabel | `687ee06`, `e29462f` |
| 6 | Shell: two-line logo, ▸ marker, Ink boxless active item | `7657c9b`, `a282144` |
| 7 | Home and browsing: Side A/B, A1 numbers, vinyl on the playing record, greeting | `80bb33d`, `d86510d` |
| 8 | Entity pages; `on-brand` readable brand buttons; Suggestions label | `afbc758`, `208dd9c`, `6055e04` |
| 9 | Players and lyrics; floating window restyles live | `60b22b0` |
| 10 | Shared UI primitives, Settings, Rewind chrome, About, What's New | `1216d81`, `85f9bc9`, `d6b482e` |
| 11 | Layout preview miniatures (25 look x layout), safe cover URLs, transport glyphs `« > || »` | `94478d4`, `997da7b` |
| 12 | Look editor (draft only; `commitDraft` saves) | `9f8c0e9`, `dfc58a1` |
| 13 | Welcome + "Make it yours" first-launch picker | `c49a7fa`, `45772ba` |
| 14 | Looks in Settings; confirm unreadable looks; Windows-safe export names | `c44b598`, `1aec1da` |
| 15 | Tour fix (Ink full-screen play), 0.9.0 version, What's New, README | `11b493f`, `c7779c6` |
| Final | Final review fixes (previous-install check, layout clamp, floating sync, minors) | `05705b4` |

Also on the branch: `9010af7`, the first version of this handoff doc.

## The ledger (source of truth for progress)

`.superpowers/sdd/2026-10-27-themes-release-1/progress.md` is git-ignored and local only. It holds:
- the pre-flight scan
- every ruling
- every task's completion line
- all deferred minor findings

Task briefs, implementer reports, review diffs and screenshots sit in the same folder:
`task-N-brief.md`, `task-N-report.md`, `review-*.diff`, `shots/task-N/`.

Trust the ledger and `git log` over memory. A task with a `Task N: complete` line is done.

## Process being used

The process is superpowers:subagent-driven-development. For each task:
1. One implementer subagent works from a brief file and writes a report file.
2. A reviewer subagent checks spec and quality against a diff package.
3. Fix rounds follow: resume the same implementer, then run a scoped re-review, until clean.

Helper scripts live in the skill's `scripts/` folder: `task-brief PLAN N` and `review-package PLAN BASE HEAD`. Model choice: Opus for design-heavy UI tasks, Sonnet for the rest and for reviews.

## Things built (reuse them)

- `src/lib/theme/looks.ts`: `Look`, `BUILT_IN_LOOKS`, `FONT_STACKS`, `isLinerLook`.
- `src/lib/theme/tokens.ts`: `deriveTokens` (returns `{}` for Classic), `contrastRatio`.
- `src/lib/theme/store.ts`: `useThemeStore`, `useActiveLook`, `initialLookFor` (updaters get Classic, new installs get Sleeve), `saveCustom`, `renameCustom`, `deleteCustom`, `pickerSeen`.
- `src/lib/theme/apply.ts`: writes `data-look` and `data-touch-*` on `<html>`. Classic removes only what it set.
- `src/lib/theme/file.ts`: theme files. `src/lib/theme/edit.ts`: `editLook`, `commitDraft`. `src/lib/theme/first-launch.ts`: `continuePicker`, `skipPicker`, `skipsWelcome`. `src/lib/theme/transport-glyphs.ts`.
- `src/components/theme/`: touch components, `look-type.tsx`, `look-preview.tsx` + `miniatures/`, `look-editor.tsx`, `make-it-yours.tsx`, `welcome.tsx`.
- `src/components/settings/looks-group.tsx`: Task 14.
- `src/lib/app-name.ts`: `APP_NAME`.
- Classic-safe gating: `:root[data-look] …` CSS, component attributes (`data-liner`, `data-ink`), or `useLookFamily() === "classic"`. Radius tokens are unset under Classic, so always write `var(--radius-x, <today's value>)` with a fallback that exists.

## Rulings made on the user's behalf (they can override any)

1. `FONT_STACKS` lives in `looks.ts`.
2. Touch attributes are `data-touch-<kebab>`; Classic has none.
3. Editing Classic starts from the palette in use (light or dark).
4. `APP_NAME = "YTubic Plus"`. The Welcome omits "FORMERLY…" until a rename, and keeps "BUILT ON YTUBIC BY NUBER".
5. Task 15 does local release work only and stops before push, tag or publish.
6. Task order was 1, 2, 4, then 3 onward.
7. A theme file's `author` is exported but dropped on import.
8. "Liner looks" means base sleeve, paper or ink-liner.
9. The Home greeting follows time of day.
10. The vinyl sits on the card for the playing track, falling back to the first Listen again card.
11. Brand buttons use `on-brand`, scoped to looks, so Classic keeps pure white.
12. Ink gets a quiet, boxless active sidebar item.
13. Transport glyphs are `« > || »`, because the bundled mono font lacks ◂◂ ▸▸ ❚❚.
14. The look editor keeps a draft; parents save via `commitDraft` (picker Continue, Settings "Use this look").
15. Picker tests never wipe storage: back up, remove only theme keys, restore and verify.
16. Preview covers load with no referrer.
17. Looks under 3:1 contrast need a confirmation before they're applied (Task 14 fix round).
18. The version is 0.9.0, as the plan says, though the README roadmap said themes come "in 1.0".
19. The previous-install check counts `ytm-settings`, `ytm-whats-new`, `ytm-playback` or `ytm-layout`.
20. The picker always saves the Sidebar layout in release 1.
21. Unsaved drafts are dropped on Escape (a "Not saved yet" hint is shown).

## Deferred minors for the final review

The ledger lists every `minor (deferred)` line. Notable ones:
- **Accessibility nits in the queue:** artist text is dropped under numbering, and the "●" isn't `aria-hidden`.
- **Theme names** keep bidi and zero-width characters.
- **No test wires `hadPreviousInstall`** to the real `ytm-settings` key.
- **Paper's `--destructive`** is about 2.4:1.
- **The sidebar ▸ and "●"** may also fall out of the mono font subset.
- **A saved Rewind slide under Sleeve is untested.** The profile has no finished Rewind.
- **An unsaved draft is dropped** silently on Escape.
- **Prettier warnings** in a few files.

## Machine and environment gotchas

- **Visual checks** use the project skill `.claude/skills/run-app/` (WebView2 over CDP). Never take full-desktop screenshots; the user's other apps are private.
- **Test surfaces** go in a portal on `document.body` at the top z-index. The app's side card otherwise draws over them (the user caught this).
- **Switching looks in dev:** write localStorage `ytm-looks` and reload. A DevTools import of the store is a separate module instance.
- **Storage:** dev may share WebView2 storage with the installed app. Always back up and restore localStorage around tests.
- **The installed YTubic Plus is closed for testing** (the user approved this). Remind the user to reopen it.
- **Dev runs claim the `ytubic-plus://` and `ytubic://` links** for the debug build. After testing, the user should run the 0.8.1 installer again, or re-point `HKCU\Software\Classes\<scheme>\shell\open\command` to `C:\Users\sdand\Desktop\YTubic\ytubic.exe`. Shell is Git Bash, so use `MSYS_NO_PATHCONV=1` with `reg` and single-quote the paths.
- **Held for the next patch:** `96bc42b` and `5c84bb4` (the player remembers song and position) are pushed on `main` but not released. Never push a version tag without the user's say-so; a tag push starts the release build.

## Earlier this session (already done)

- Roadmap idea "Sort playlists by artist" was added to the README (`2db5b76`) and pushed with the player commits.
- Installed 0.8.1 checks passed:
  - `ytubic-plus://` and `ytubic://` artist links open in the installed app.
  - `background=1` plays without un-minimizing the window; a normal link restores it.
- Still to check on the installed build: disliked songs being skipped in radio. That needs the user.

## About the user

They want casual, friendly replies with plain language, no corporate speak. They want an HTML mockup with real data before any UI rebuild. They make the release calls themselves.
