# Handoff: Themes release 1 (2026-10-28)

For the next agent picking up this work. Read this file first, then the ledger.

## What this is

YTubic Plus is getting its own look ("Liner notes") plus a theme system: five built-in looks
(Sleeve, Paper, Ink liner, Ink, Classic), editable custom looks, theme file export/import, and a
first-launch "Make it yours" picker. Classic must stay the current app, pixel for pixel.

- Spec (binding authority): `docs/superpowers/specs/2026-10-27-themes-design.md`
- Mockups: `docs/superpowers/specs/2026-10-27-themes-mockups/` (`liner-v2.html` = Sleeve, `first-launch-v2.html` = picker and the PRESETS seeds)
- Plan (15 tasks): `docs/superpowers/plans/2026-10-27-themes-release-1.md`

## Where things stand

- Branch: `themes-release-1`, branched from `main` at `2db5b76`. Nothing on it is pushed.
- Done and reviewed: Tasks 1-9 (commits `93894ed`..`60b22b0`).
- Task 10 (shared UI primitives, Settings, Rewind chrome, About and What's New dialogs) is implemented in `1216d81` and `85f9bc9`, and its review was dispatched. Check the ledger for a `Task 10: complete` line; if there isn't one, run its review (`review-package PLAN 60b22b0 85f9bc9`).
- Left: Task 10 review, 11 (layout preview miniatures), 12 (look editor), 13 (welcome + first-launch picker), 14 (looks in Settings → Appearance, export/import UI), 15 (release prep), then a final whole-branch review.

## The ledger (source of truth for progress)

`.superpowers/sdd/2026-10-27-themes-release-1/progress.md` (git-ignored, local only). It holds the
pre-flight scan, every ruling, every task's completion line, and all deferred minor findings. Task
briefs, implementer reports, review diffs and screenshots sit in the same folder
(`task-N-brief.md`, `task-N-report.md`, `review-*.diff`, `shots/task-N/`). Trust the ledger and
`git log` over memory. A task with a `Task N: complete` line is done; don't redo it.

## Process being used

superpowers:subagent-driven-development. Per task: one implementer subagent (brief file + report
file), then a reviewer subagent (spec + quality) on a diff package, then fix rounds (resume the
same implementer, then a scoped re-review) until clean. Helper scripts live in the skill's
`scripts/` folder: `task-brief PLAN N`, `review-package PLAN BASE HEAD`. Tasks 6-10 share one plan
section, so `task-brief` can't extract them; their briefs were written by hand (copy the pattern
in `task-9-brief.md`). Opus for design-heavy UI tasks, Sonnet for the rest and for reviews.

## Things built so far (reuse them)

- `src/lib/theme/looks.ts`: `Look`, `BUILT_IN_LOOKS`, `FONT_STACKS`, `isLinerLook(look)` (base is sleeve, paper or ink-liner).
- `src/lib/theme/tokens.ts`: `deriveTokens(look)` (returns `{}` for Classic), `contrastRatio`.
- `src/lib/theme/store.ts`: zustand persist `ytm-looks`; `useActiveLook()`, `initialLookFor()` (updaters get Classic, new installs get Sleeve), `saveCustom` (assigns `custom-…` ids).
- `src/lib/theme/apply.ts`: writes tokens + `data-look` + `data-touch-<kebab>="on|off"` on `<html>`; Classic removes only what it set.
- `src/lib/theme/file.ts`: `toThemeFile`, `parseThemeFile` (hostile-input safe, expands `#rgb`, unbuilt layouts fall back to Sidebar with a note). Rust `save_text_file` in `src-tauri/src/lib.rs`.
- `src/components/theme/`: `SectionLabel`, `TrackNumber`, `Vinyl`, `TapeCounter`, `TransportLabel`, `look-type.tsx` (`useLookFamily`, `recordTitleClass`, `PageTitle`).
- Tailwind roles: `font-headline`, `font-display`, `font-meta`, `.look-case`. They fall back to today's font under Classic.
- Classic-safe gating: `:root[data-look] …` CSS, component attributes like `data-liner` / `data-ink`, or a `useLookFamily() === "classic"` fork. Radius tokens are unset under Classic, so always write `var(--radius-x, <today's value>)`.
- Brand fills: add `on-brand` next to `text-white` so text is readable on every look's accent; Classic keeps pure white.

## Rulings already made (don't relitigate; the user can override)

1. `FONT_STACKS` lives in `looks.ts` (Task 1 created it).
2. Touch attributes are `data-touch-<kebab>`; Classic has none.
3. Editing Classic (Task 12) starts the draft from the palette in use (light or dark).
4. `APP_NAME = "YTubic Plus"`. The Welcome omits "FORMERLY…" until a rename is chosen, but keeps "BUILT ON YTUBIC BY NUBER".
5. Task 15 does the local release work only and **stops before push, tag or publish**.
6. Task order was 1, 2, 4, then 3 onward.
7. A theme file's `author` is written on export and dropped on import (no field for it yet).
8. "Liner looks" = base sleeve, paper or ink-liner (`isLinerLook`).
9. The Home greeting follows time of day.
10. The vinyl sits on the shelf card matching the playing track, falling back to the first Listen again card.
11. Brand buttons use `on-brand`, scoped to looks.
12. Ink gets a quiet, boxless active sidebar item (the spec says "no boxes").

## Deferred minors for the final review

The ledger lists every `minor (deferred)` line. Notable ones: a11y nits in the queue (artist text
dropped under numbering, track number and "●" not `aria-hidden`); theme names keep bidi or
zero-width characters (display spoofing only); no test wires `hadPreviousInstall` to the real
`ytm-settings` key; Paper's `--destructive` is about 2.4:1; prettier warnings in
`appearance-tab.tsx` and `index.css`.

## Machine and environment gotchas

- **Visual checks** use the project skill `.claude/skills/run-app/` (WebView2 over CDP). Never take a full-desktop screenshot; the user's other apps are private. Use CDP screenshots of the app only.
- **Switching looks in dev**: a DevTools import of the store gets a separate module instance, so write localStorage `ytm-looks` (persisted shape in `store.ts`) and reload. The floating window picks it up live via the `storage` event.
- **The installed YTubic Plus is closed** for testing (the user approved this). Don't relaunch it mid-task. Remind the user to reopen it when done.
- **Dev runs claim the `ytubic-plus://` and `ytubic://` links** in HKCU for the debug build. Release builds never take them back, so after testing tell the user to run the 0.8.1 installer again (or re-point `HKCU\Software\Classes\<scheme>\shell\open\command` to the installed exe).
- **Held for the next patch**: `96bc42b` and `5c84bb4` (player remembers song and position) are on `main` and pushed, but not released. No tag is pushed until the user says so. Pushing a version tag starts the release build.
- Shell: Windows. Bash is Git Bash, so use `MSYS_NO_PATHCONV=1` with `reg` and single-quote registry paths.

## About the user

They want casual, friendly replies with plain language, no corporate speak. They want to see an
HTML mockup with real data before any UI rebuild. They make the release calls themselves.
