# Themes: a look of our own, and a way to make it yours

## Intent

YTubic Plus looks like the many other copies of the original YTubic. This project gives
Plus an identity of its own and, at the same time, lets people make the app look like
theirs: Spicetify-level control over almost every part of the interface, but built into
the app instead of patched on, and with a large shelf of ready-made looks so nobody has
to touch a setting to get something that feels personal.

The new house style is **Liner notes**: record-sleeve typography (serif headlines,
typewriter-style details, bold uppercase titles), lots of dark space, and a single red
accent. It sits alongside the original look, which stays available for anyone who
likes the app as it is.

Mockups for everything below are in [`2026-10-27-themes-mockups/`](2026-10-27-themes-mockups/)
(open the HTML files in a browser; they use placeholder covers and names).

## Goals

- A new default look, **Sleeve** (dark Liner notes), that makes Plus recognisably Plus.
- A **first-launch "Make it yours" screen**: pick a look and a layout from live
  previews, see each colour's default and change it, and open **Advanced** for more.
- Customisation in three layers, combined freely:
  1. **Layout**: how the app is arranged.
  2. **Look** (style): colours, fonts, accent, surface feel.
  3. **Details**: every individual setting under the look.
  A **preset** is a named bundle of the three. Most people pick a preset and stop.
- **Classic**: the original YTubic look, unchanged, always selectable.
- **Export and import theme files**, so people can share looks by hand (Discord,
  Reddit) before there is a gallery.
- A **large preset library** over time. Release 1 starts with five looks; adding a look
  later should be adding data, not code.

## Non-goals (for now)

- An in-app community gallery or marketplace (long-term goal, not this project).
- Arbitrary user CSS or JavaScript injection.
- Theming the floating player window as a separate theme (it follows the main theme).

## Anti-goals (a failure even if it works)

- Anyone updating from 0.8.x finding their app restyled without choosing it.
- Classic drifting from today's look: it must be the current interface, pixel for pixel.
- A theme file that can run code, read files, or reach the network.
- Looks that only work with some layouts: every look must work on every shipped layout.
- Fonts or assets loaded from the internet at runtime (the app must look right offline).

## Decided by the user

- Direction: Liner notes (option C), after comparing Ink, Panels and Liner notes.
- All explored looks and layouts are kept as options rather than picking one.
- First launch shows layout and look choices with live previews, colour choices with
  the defaults shown and editable, and an Advanced mode for more.
- The original look ships as an option (Classic).
- Sharing: local only at first, with export of a theme file; sharing with others
  long term.
- Order: release 1 is the engine plus looks on the current layout; other layouts come
  one per later release.
- **Release 1 is a polish pass over the whole app.** Every look reaches every screen:
  Home, Library, playlist / album / artist pages, Search, Explore, Downloads, Rewind,
  Settings, dialogs, context menus, toasts, tooltips, lyrics, the full-screen player,
  the floating player and the first-launch screen itself. The record touches (section
  numbering, vinyl, tape counter, text transport) appear wherever their kind of element
  appears, not only on Home.
- Many more looks are wanted; five is the starting set.

## The three layers

### Layouts

| Layout | What it is | Release |
|---|---|---|
| **Sidebar** | Today's arrangement: sidebar, page, now-playing card (or bottom bar / floating, as today). | 1 |
| **Gatefold** | Two pages like an open double LP. The left page is always the playing record: big cover, credits, lyrics set like a lyric sheet, transport at the bottom. The right page is everything else. Tabs across the top, no sidebar. | later |
| **Index** | Home as a magazine contents page: large numbered serif entries, a few covers each. The player is a bright cassette-label strip across the top. Playlists in an "Appendix" column. | later |
| **Crate** | Browsing as flipping through a record crate: sleeves lean back in 3D, the front one is large with Play / Queue / Like, section "dividers" switch shelves. A turntable along the bottom spins the playing record, its label cut from the cover. | later |
| **Panels** | Spotify-style rounded panels, a bottom player bar, a colour wash from the art. | later |

Layouts not yet built still appear in the first-launch screen and in Settings with a
live preview and a "later update" label, so people can see what's coming.

### Looks (release 1)

| Look | Feel |
|---|---|
| **Sleeve** (new default) | Near-black warm background, cream type, serif headlines, mono details, uppercase titles, red accent, A1/B2 numbering, the vinyl peeking out of the last-played record. |
| **Paper** | The light Liner notes: cream sleeve, black ink, hard offset shadows on covers, red accent. Also serves people who want a light theme. |
| **Ink liner** | Liner notes typography on pure black with no accent colour: the art is the only colour. |
| **Ink** | Pure black, quiet lowercase sans, no boxes, no numbering. |
| **Classic** | The original YTubic look, unchanged, including the album-art ambient background and the current light / dark / system switch. |

### Details (Advanced)

Everything a look sets, individually editable, each showing its look's default with a
one-click reset. At minimum (from the mockup):

- **Colours:** background, text, accent, secondary text, faint text, lines.
- **Fonts:** headline, title, detail (from bundled fonts).
- **Shapes:** window corner radius, cover corner radius, button radius.
- **Touches:** vinyl peeking out, section numbers (A1, B2), uppercase titles, offset
  cover shadows, tape-counter vs plain progress bar, text vs icon transport buttons.

The full list is the builder's call (see below); the rule is that anything a shipped
look changes must be reachable here.

## First launch: "Make it yours"

Shown once, as a single screen when the app first opens (the step strip in the
mockup is decoration; sign-in stays where it is today, in the sidebar). See
`first-launch-v2.html`.

- Left: **Look** cards (colour swatches, name, one line), **Layout** cards (diagram,
  name, "later update" where relevant), **Colours** with defaults shown and resettable,
  an **Advanced** drawer, and **Continue**.
- Right: a **live preview** of the real app in the chosen layout, look and colours.
- New installs start on **Sleeve + Sidebar**. People updating from 0.8.x see the
  screen once with **Classic** preselected, so nothing changes unless they pick
  something.
- Everything here is also in **Settings → Appearance** later, with the same preview.
- **Preview content:** signed-in people (most updaters) see their own library. A fresh
  install has nothing yet, so the preview uses neutral placeholder covers (generated
  shapes in the look's colours, no third-party art) and generic titles.
- **Unbuilt layouts** preview through lightweight, preview-only miniatures like the
  mockup's, drawn from the same tokens so they follow every look automatically. Each is
  replaced by the real layout when that layout ships.

## Theme files

- A theme file holds a layout, a look and any changed details, plus a name and an
  author. It is plain data (JSON), validated on import; unknown keys are ignored and
  bad values fall back to the look's defaults.
- **Export** from Settings → Appearance writes the current setup to a file.
  **Import** loads one and lists it next to the built-in looks.
- A file that names a layout the app doesn't have yet falls back to Sidebar and says so.
- Versioned, so later releases can read older files.

### Your own looks

- Changing any colour or detail of a built-in look creates a **custom look** ("Sleeve,
  edited") instead of altering the built-in one, which always stays available to go
  back to. People can keep several, rename them and delete them.
- Imported theme files appear in the same **Yours** row as custom looks.
- Classic can be edited too; the result is a custom look based on it, and Classic
  itself stays the untouched original. Classic carries a light and a dark palette (it
  keeps the light / dark / system switch), so its colour editor edits the palette in
  use.

## Constraints

- Tauri 2 app, React + Tailwind. Styling already runs on CSS custom properties
  (`src/index.css`, shadcn-style tokens, `@theme inline`), so looks map onto
  variables rather than new components where possible.
- Light / dark today comes from `next-themes`; the ambient album-art background and the
  interface font are existing settings (`lib/store/settings.ts`,
  `lib/interface-font.ts`). Classic keeps all three working exactly as today. For the
  other looks, the light / dark choice is part of the look (Paper is light).
- The floating player is a second window sharing settings through localStorage (with a
  `storage` listener); it must restyle live when the theme changes, as it does today.
- Fonts are bundled with the app (Instrument Serif, Archivo, JetBrains Mono are all
  SIL OFL), never fetched.
- Existing layout modes (side card, bottom bar, floating) remain part of the Sidebar
  layout.

## Calls I made (not discussed; check these)

- The setting names and the JSON shape of theme files.
- Classic's light / dark / system switch and ambient background stay Classic-only;
  the new looks each have a fixed light or dark character.
- The fonts above, bundled under the OFL (Inter is already bundled).
- One screen at first launch, no new sign-in step.
- Placeholder covers on a fresh install; the user's library when signed in.
- Preview-only miniatures for layouts that aren't built yet.
- Edits create custom looks; built-ins never change. Imports sit with custom looks.
- Floating player follows the main theme rather than having its own.
- First-launch screen comes before sign-in.

## Left to the builder

- How looks are stored and applied (a token map on the root element is the natural fit).
- The exact list of Details controls beyond the minimum above.
- How the live preview is rendered (the real components at a small scale is
  preferred over a picture, so it stays honest).
- Migration of the existing Appearance settings into the new model.
