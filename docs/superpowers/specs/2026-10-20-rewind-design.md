# Rewind: a quarterly, Wrapped-style recap

## Intent

A Spotify Wrapped-style recap of your own listening, every quarter, built and kept
entirely on your computer. The draw of Wrapped is seeing your own year told back to
you in big, shareable slides; the comparison and social features are not what people
come for, so they are left out. YTubic Plus does not collect personal data, and
Rewind must not change that.

## Goals

- A full-screen, tap-through story of your last quarter: top songs, artists and
  albums, minutes listened, when you listen, new artists you found.
- Looks like it belongs to the album you played: each slide is coloured by its art.
- Works with no account and no server, and nothing leaves the device.
- Past rewinds stay available to rewatch.
- **Import past listening** from a Google Takeout export (decided by the user), so a
  rewind can include plays from before YTubic Plus was installed.

## Non-goals

- Anything that needs other people's data: fan leaderboards, "compared to other
  listeners", friend games / Wrapped Party, AI listening reports.
- Listening Age (needs release years, which tracks don't carry today).
- Last.fm import (Last.fm users already have Last.fm's own stats).
- A mobile app or web share link.

## Anti-goals (a failure even if it works)

- Any play data sent anywhere: no analytics, no upload, no sync.
- The play log slowing playback down or growing without bound.
- AI songs the user has hidden showing up as a highlight (respect the AI switch as it
  is when the rewind is built).

## Decided (by the user)

- **Cadence:** quarterly.
- **Format:** full-screen story slides like Wrapped: progress bars at the top, tap /
  click / arrow keys / swipe to move, Esc to close.
- **Look:** mockup "C" big type: heavy, huge numbers and names.
  - Artist slides show that artist's **most-played album cover from your own log**,
    **tilted** (~8°) and cropped off the right edge, with a soft shadow.
  - The slide background is a **gradient taken from that cover's colours**, with
    light grain; the big number and the small label use an accent colour from the
    same art.
  - Mockup: `.superpowers/brainstorm/*/content/rewind-style-v6.html` (local only).
- **Everything else follows Wrapped:** the usual slide set, an announcement card on
  Home when a new rewind is ready, and saving a slide as an image.
- Expect to iterate on the visuals once it runs.
- **Takeout import, not YouTube Music's built-in History page.** The History page
  lists each song once (its latest play) under rough date groups, which would make
  top lists and minutes wrong. Takeout's watch history has every play with a
  timestamp.
  - An optional "Import past listening" button (Settings and the empty Rewind state)
    opens the system file picker for the user's Takeout file. It is parsed on the
    device; nothing is uploaded.
  - **Only the current quarter is imported** (the user asked for "only this
    quarter"). Older entries in the file are ignored, so an import never creates
    rewinds for past quarters and only feeds the next one.
  - Format (my call): Takeout's **JSON** watch history (`watch-history.json`), picked
    directly or inside the Takeout `.zip`. The import instructions tell the user to
    choose JSON in Takeout (it defaults to HTML); an HTML file gets a clear "export
    as JSON" message rather than a second parser.
  - Skips (my call): Takeout logs every play start with no length. An entry followed
    by the next one less than 30 seconds later counts as a skip and is dropped,
    matching the logged-play bar as closely as the data allows.
  - Only YouTube Music plays count (Takeout mixes in regular YouTube videos; keep
    entries whose header/URL marks them as YouTube Music).
  - Minutes for imported plays are estimated from each song's length (Takeout has
    no play duration); where the length is unknown, use a sensible default.
  - Re-importing the same file must not double-count (dedupe by video id + time).
    Imported plays that overlap plays YTubic logged itself are dropped in favour of
    YTubic's own.
  - Imported plays carry less metadata (no album, maybe no thumbnail); the builder
    fills gaps by looking songs up when a rewind is built, and a slide never fails
    because one track is missing data.

- **One history per install.** YTubic Plus is treated as single-account, so the log
  and rewinds are not split by account and switching accounts doesn't touch them.

## Decided (my calls, the user can override)

- **What counts as a play:** the same bar as the Last.fm scrobbler
  (`src/lib/lastfm-scrobbler.ts`): played for half its length or 4 minutes,
  whichever comes first, never for tracks under 30 seconds. Paused time doesn't count.
  Minutes listened add up the real time played, including plays under that bar.
- **Quarters** are calendar quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), local time.
- A rewind becomes available on the first day after its quarter ends. A first
  rewind covering less than a full quarter still appears if there is enough to
  show (builder picks the minimum, e.g. ~1 hour and 10 distinct songs).
- **Past rewinds are kept** and can be rewatched (they are small).
- **A built rewind is a frozen snapshot** (my call). Once a quarter ends and its
  rewind is built, it never changes; its raw plays can then be dropped, which keeps
  the log bounded to roughly one quarter of raw plays. Imports only touch the
  current quarter, so they never meet a sealed one.
- **The history switch only pauses logging** (my call). With it off, past rewinds
  still show and import still works; turning it off deletes nothing. Clearing is
  its own button.
- **Slide set:** intro → minutes listened → top artist (with cover) → top 5 artists →
  top song → top 5 songs → top album → when you listen (time of day) → new artists
  you found this quarter → a summary slide (the one most people share).
- **Slides without an album cover** (minutes, time of day, summary) take their
  colours from your overall top album of the quarter.
- **Settings > Privacy (or Playback):** a "Keep listening history for Rewind" switch
  (on by default, says it stays on this computer), and "Clear listening history",
  which also deletes saved rewinds.
- A Rewind entry in the sidebar or in Library lists past rewinds; the Home card
  opens the newest one.
- **Save as image:** saves the current slide as a PNG through the system save
  dialog. No sharing integrations.

## Constraints

- Store the log in IndexedDB like the other big stores (`src/lib/store/idb-storage.ts`,
  `idb-keyval`), never localStorage.
- Bound the size: raw plays are kept only for the open quarter (see "frozen
  snapshot" above); also cap raw plays per quarter as a safety net.
- Logging must not touch the audio path or re-render the player every second; reuse
  the scrobbler's approach (imperative reads, one timer while playing).
- What a play records: video id, title, artists (ids + names), album + album id,
  thumbnail URL, start time, seconds played. Nothing else.
- AI: plays are logged as they happen; a rewind built while AI music is off leaves
  out confirmed AI (`isAiBlocked`). Plays the user started with "Play anyway" count.
- Respect the app's light/dark and reduced-motion settings (slides still animate
  with reduced motion off, but transitions turn into cuts with it on).
- Keep `whats-new.ts` and the README in step when it ships.

## Left to the builder

- How the cover colours are read (canvas on the artwork, falling back to a
  blurred cover if the image can't be read cross-origin, or a fixed palette).
- Exact slide copy, animations, timing, and the minimum data needed for a rewind.
- How the PNG is rendered (a DOM-to-image library vs drawing to a canvas).
- Where precisely the Rewind entry lives (sidebar vs Library).
- File layout, data shapes and tests.
