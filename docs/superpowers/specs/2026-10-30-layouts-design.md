# Layouts: Gatefold, Index, Crate and Panels

## Intent

Porchlight 1.0 ships one layout, Sidebar, and shows four more as "later update" previews.
This project builds those four for real, so a person can rearrange the whole app whenever
they feel like a change, with any look on any layout.

The user doesn't see one layout as the one they'd live in. In their words, the fun is
"switching between them", and what makes them switch is simply "feeling like a change".
So switching has to be quick, playful and very Porchlight. It is as much the feature as
any single layout.

Mockups (Sleeve look, real covers):
- `docs/superpowers/specs/2026-10-27-themes-mockups/liner-layouts.html`, the original
  Gatefold, Crate and Index
- the newer page at https://claude.ai/artifact/27xaUPVn1bEUDMimjTYB4N, which adds Panels
  and the switching ideas

## Goals

- **Four new layouts**, built as the mockups show them:
  - **Gatefold**: two pages like an open double LP.
    - The left page is always the playing record: big cover, credits, lyrics set like a
      lyric sheet, controls at the bottom.
    - The right page is everything else, with tabs across the top and no sidebar.
  - **Index**: Home reads like a magazine contents page, with big numbered entries and a
    few covers each.
    - The player is a bright cassette-label strip across the top.
    - Playlists sit in an "Appendix" column on the right. No sidebar.
  - **Crate**: browsing like flipping through a record crate.
    - Sleeves lean back, and the front one is large with Play, Queue and Like.
    - Dividers switch between shelves.
    - A turntable along the bottom spins the playing record, its label cut from the cover.
  - **Panels**: rounded panels on black, a player bar along the bottom, and a soft colour
    wash from the playing cover.
- **Every look works on every layout** (Sleeve, Paper, Ink liner, Ink, Classic, and
  custom looks). This was already an anti-goal of the themes spec.
- **Every screen works in every layout**: Home, Explore, Search, Library, playlist,
  album and artist pages, Downloads, Rewind, Settings, lyrics, dialogs and menus.
  - Where a layout reshapes a screen (Index's contents page is Home), the other screens
    keep their usual content inside that layout's frame.
- **Switching on a whim:**
  - **The turntable dial (main control).** A small round knob next to the logo, modelled
    on a record player's 33/45 speed switch.
    - Five notches: Sidebar, Gatefold, Index, Crate, Panels. Tick marks show the
      positions, and the current one is lit in the look's accent.
    - A click turns it one notch. The mouse wheel over it turns it either way. Hover
      shows the layout's name. It is reachable with Tab and the arrow keys, and screen
      readers hear it as a choice of layouts.
  - **Ctrl+L** cycles to the next layout.
  - **The change itself:** the app flips like a record being turned over, and a small
    card names the layout for about a second.
  - **Settings → Appearance** offers the same choice, with live previews.
  - **The first launch after this update** shows a one-line tip pointing at the dial:
    "Turn this to change layouts."
- **Porchlight remembers the last layout** between launches.
- **The floating mini player stays available in every layout** ("a hallmark feature of
  most music player apps"). It pops out and keeps playing on top of other windows,
  whichever layout the main window is in.
- **Everything already pointing at layouts starts working:**
  - The "later update" labels and preview-only miniatures in the first-launch picker
    and Settings are replaced by the real layouts.
  - Theme files that name a layout now apply it instead of falling back to Sidebar.
  - The Release 1 rule "the picker always saves Sidebar" is lifted.

## Release

All four layouts arrive **together in one content update**, before 1.1 (the user's
choice). Nothing ships until the whole set is ready.

## Non-goals

- New looks. The user wants more looks too, but that's a separate content piece.
- A new logo. The user wants one, and it gets its own design after this.
- Layouts beyond these four, and per-screen layout choices (one layout for the whole app
  at a time).
- Changing today's Sidebar layout, apart from adding the dial to it.

## Anti-goals (a failure even if it works)

- Switching layouts loses anything: playback, queue position, scroll in a long list,
  a half-typed search, or the floating player.
- A look that's unreadable or broken in some layout.
- A screen that's missing or unreachable in some layout (for example, Settings or
  Downloads with no way to get there).
- Switching that feels slow or janky, since it's meant to be done on a whim.
- The dial being so hidden that people never discover layouts exist.
- People upgrading from 1.0 finding their app in a different layout without choosing it:
  everyone stays on Sidebar until they switch.

## Constraints

- Tauri 2 + React 19 + Tailwind v4; the look engine applies CSS tokens on `<html>`.
  Touch components (SectionLabel, TrackNumber, Vinyl, TapeCounter, TransportLabel) and
  the typography roles already exist.
- The look store already persists a `layout: LayoutId`
  (`"sidebar" | "gatefold" | "index" | "crate" | "panels"`) in `ytm-looks`.
  `src/lib/store/layout.ts` holds today's player mode (`"right" | "bottom" | "floating"`)
  for the Sidebar layout.
- The floating player is a second window with its own app
  (`floating-player-app.tsx`). It follows the look through the shared `ytm-looks`
  storage key.
- The preview miniatures in `src/components/theme/miniatures/` define each layout's
  shape at small size.
- No assets fetched at runtime. Respect `prefers-reduced-motion`: the flip becomes a
  plain fade, and the dial's turn and the turntable's spin stop.
- UI copy: no em or en dashes.

## Decided by the user

- All four layouts, as in the mockups.
- Switching on a whim is the point. The turntable dial is the main control, and the user
  likes all three switching ideas (dial, shortcut + flip, buttons/Settings).
- All four ship together in one content update before 1.1.
- The floating mini player is available in every layout.

## Calls I made (check these)

- Ctrl+L plus the flip animation come with the dial. The plain buttons idea lives in
  Settings → Appearance rather than in the top bar, so there aren't two switchers side by
  side.
- The last layout is remembered between launches.
- The dial's click sound is optional and off by default.
- Sidebar's own player modes (side card, bottom bar) stay Sidebar-only. The other
  layouts have their own built-in player. Floating works everywhere.
- **Narrow windows:** each new layout has a compact form for small window widths. Below a
  width where the layout can't hold its shape (for example, Gatefold's two pages), it
  falls back to its compact form rather than to a different layout.

## Decided by the user after the builder review

- **Crate is Home only.**
  - Home is the record crate: leaning sleeves, a big front record, and dividers
    switching shelves.
  - Explore, Library, artist and album pages, search results and the rest keep their
    usual lists inside Crate's frame, with the turntable along the bottom.

## Settled after the builder review (my calls)

- **Floating player alongside a built-in player:**
  - Floating becomes its own on/off, separate from the layout.
  - When it's popped out, the layout's built-in player stays on screen as it is, so
    Gatefold's left page stays the playing record. Floating is an extra, not a
    replacement.
  - Each layout's player has a pop-out button (Sidebar's stays where it is today).
    Closing the floating window just closes it.
  - Sidebar keeps today's behaviour: floating there still replaces the side card, and
    closing it brings the side card back.
- **Nothing playing:** each layout keeps its shape and shows an empty state instead of
  hiding its player:
  - Gatefold's left page becomes an empty sleeve with "Nothing playing yet" and a few
    picks to start from.
  - Index's strip reads "Nothing on the tape".
  - Crate's turntable shows an empty platter.
  - Panels' bar is idle.

  These need mockups in the plan before they're built.
- **Layouts in theme files:** a look stays layout-free. On import, a file that names a
  layout offers to switch to it once ("This look was made for Crate. Switch to Crate?").
  Exporting writes the current layout into the file. Picking a look later never changes
  the layout.
- **Index shelves:** each contents entry opens a shelf page showing the whole shelf, so
  nothing on Home is only reachable from other layouts.
- **Where this ships:** Porchlight 1.0 is released and merged to `main`, so the work
  branches from `main`. The content update is a normal release through the updater
  (1.1, or 1.0.x if it lands earlier). The "turn this to change layouts" tip shows on the
  first launch of that version.

## Left to the builder

- How the shell becomes swappable, i.e. the one-time work that lets the app change
  arrangement while every page keeps its content and state.
- Exact compact-form breakpoints for each layout.
- Crate's 3D flip performance, and how keyboard navigation works through the crate.
- Where the dial sits in each layout's chrome (near the logo in each one).
- The flip transition's implementation, as long as it never drops playback or state.
- How the existing preview miniatures are replaced or reused.
