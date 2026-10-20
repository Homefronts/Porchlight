# AI Music Filter: Design

Status: draft for review, 2026-10-20. Target release: YTubic Plus 0.7.0.

## Why

A growing share of new music on YouTube is AI-generated, and some listeners
want nothing to do with it. YouTube Music offers no way to opt out. It doesn't
even mark AI songs: probing the app's own InnerTube requests (`next`, `player`
and the WEB watch page) for well-known AI acts (The Velvet Sundown, Xania
Monet, Breaking Rust) found no AI or "altered / synthetic content" field.
Those acts' songs look identical to Queen's. So detection has to come from
outside YouTube.

Success: someone who turns AI music off stops hearing it in mixes, search and
the home feed. Everyone can always tell at a glance whether a song on screen
is AI. Real artists are never hidden by mistake.

## Goals

- One switch, **AI music**: on or off.
- An **AI tag** on every AI song shown anywhere in the app, whatever the
  switch is set to.
- Detection built on community-maintained lists, cross-checked against
  Spotify's public data.
- An uncertain match is labelled **"AI?"** (maybe), never hidden.
- An honest in-app message when detection is degraded.

## Non-goals

- Detecting AI from the audio itself. Deezer's detector is closed and paid,
  and nothing open is good enough.
- Removing AI songs from the user's own library: they stay visible there
  (greyed out and skipped when the switch is off, see Filtering).
- Multi-account behaviour. The app is single-account (see the downloads
  design).
- Sending users' reports back to the community lists automatically. A link
  to the upstream submission form is fine; a write integration is not.

## Anti-goals (a failure even if it technically works)

- **A real artist is hidden** because they share a name with an AI act.
- **The app slows down** or makes extra network requests per song or page
  to decide tags.
- **Every user hits Spotify.** Thousands of clients scraping Spotify would
  get the data source blocked.
- **The app breaks or nags** when a data source changes. The worst case is
  reduced mode plus one notice.

## How it works

### 1. Data sources (all of them)

| Source | What it gives | Matched by |
|---|---|---|
| [CennoxX/spotify-ai-blocker](https://github.com/CennoxX/spotify-ai-blocker) `SpotifyAiArtists.csv` (~7,900 rows, MIT, daily) | `artist,id` (Spotify artist id) | name + Spotify cross-check |
| gounetmusic hand-verified list (see CennoxX PR #1301; CC BY 4.0) | same CSV format | name + Spotify cross-check |
| [cevvalkoala/CevvalYoutubeAIBlocklist](https://github.com/cevvalkoala/CevvalYoutubeAIBlocklist) (uBlock list) | YouTube channel handles / ids | exact channel match |
| The user's own choices (in-app) | "Mark artist as AI" / "Not AI" | YouTube channel id, always wins |

Licensing: MIT and CC BY 4.0 need attribution. Credit all sources in the
README, the About dialog and the published data file. **The CevvalKoala list
has no visible license.** The builder checks; if it has none, open an issue
asking permission, and ship without it until it's granted.

### 2. Daily build job (GitHub Actions on Homefronts/YTubic-)

All the heavy work runs once a day on GitHub, never in the app:

1. Download every source list.
2. For each Spotify entry, read Spotify's public embed page
   `https://open.spotify.com/embed/artist/<id>`. No login is needed; its
   `__NEXT_DATA__` script holds the artist name and top ~10 track titles.
   Verified working on 2026-10-20.
3. Search YouTube Music for the artist name (unauthenticated `WEB_REMIX`
   search, as in `src/lib/innertube`). For each YouTube artist channel whose
   normalised name matches, fetch its songs.
4. Decide, per YouTube channel:
   - **AI (confirmed):** name matches **and** at least one normalised song
     title overlaps the Spotify top tracks. Or: an exact channel match from
     the YouTube list.
   - **AI? (maybe):** name matches but no song overlaps, or the Spotify step
     failed for this artist.
   - When several YouTube channels share the name, each is judged on its own:
     only channels with a song overlap are confirmed; the rest are only
     "maybe". A real artist with an AI namesake keeps its own channel id and
     is never confirmed.
5. Runs in the app repo (Homefronts/YTubic-), with the default token and
   `contents: write` to push the `ai-data` branch. Before building the app
   side, do a trial run to confirm GitHub's runners can reach Spotify and
   YouTube Music. If Spotify blocks them, the job reports `degraded` (reduced
   mode) rather than failing.
6. Publish one file, `ai-artists.json`, and commit it to a dedicated
   `ai-data` branch. The app reads it from the raw.githubusercontent URL.

**Incremental:** the job keeps its results (in the same branch) and only
processes new entries plus a rotating slice of old ones (roughly 1/14 per
day, so everything is rechecked every two weeks). It is polite to Spotify:
one request at a time with a delay, and it stops early when it hits errors.

**Normalisation (names and titles):** lower-case, strip diacritics and
punctuation, collapse whitespace, drop a leading "the". Titles also drop
bracketed suffixes such as "(Official Video)" and "(feat. …)".

File shape (the builder may refine it):

```json
{
  "version": 1,
  "generatedAt": "2026-10-20T06:00:00Z",
  "status": { "spotify": "ok", "lists": "ok", "message": null },
  "confirmed": { "<ytChannelId>": "The Velvet Sundown" },
  "maybeNames": ["neural groove machine"],
  "sources": [{ "name": "...", "url": "...", "license": "MIT" }]
}
```

`status.spotify` becomes `"degraded"` when more than half of the Spotify
fetches fail, or the page format no longer parses. `status.lists` becomes
`"stale"` when a source can't be downloaded. In both cases the job keeps the
previous good results; it never wipes them.

### 3. In the app

**Loading the data**
- Fetch `ai-artists.json` at launch and every 24 hours (same pattern as the
  downloads sync), cached locally so it works offline.
- Ship a snapshot inside the installer for the first launch. It's a file
  committed to the app repo and refreshed by hand before each release. The
  build never fetches it, so a missing `ai-data` branch can't break a build.
- Lookups are in-memory (a Set or Map), with no per-song requests.

**Classifying a song.** A song is:
- **AI** if any credited artist's channel id is confirmed, or the user marked
  it AI;
- **AI?** if no artist is confirmed but a normalised artist name is in
  `maybeNames`;
- **not AI** otherwise.

The user's "Not AI" overrides both. User overrides never expire, whatever
later versions of the file say.

Some payloads carry artist names without channel ids. Without an id, a song
can only ever be **AI?**, never AI. It is tagged but never hidden.

`maybeNames` only matches a song's full normalised artist name exactly, never
a substring, and the job leaves out names shorter than 4 characters, so short
or common names don't get mass-tagged. My call: any credited artist counts,
since collaborations with AI acts are still AI songs.

**The switch.** A small **"AI" toggle button in the top bar, right next to
the search box** (decided by the user). One click flips it, and its state
is obvious: struck through when AI music is off. Its tooltip says "AI music
hidden · click to show" or "AI music shown · click to hide". It defaults to
**on** (shown), so nothing changes for anyone until they flip it. Settings →
Playback mirrors the same setting and holds the reduced-mode status line. In
reduced mode the top-bar button also shows a small warning dot.

**The tag.** A small "AI" chip next to the title, built like
`src/components/shared/explicit-badge.tsx` and placed wherever that badge
appears: track rows, shelf cards, the queue, the player bar. "AI?" uses the
same chip at reduced emphasis, with a tooltip: "Possibly AI: shares a name
with a known AI artist."

**Filtering (switch off).** Only confirmed AI is affected; "AI?" never is.
The rule, decided by the user: AI songs only appear in the user's own library.

- **Outside the library, AI is hidden:** search results, the home feed and
  explore shelves, artist pages, radio mixes, mood chips, autoplay and Up
  next, and playlist or album pages the user hasn't added. AI albums and
  artists are hidden from search and feeds too. If an AI artist's page is
  reached through a link, it shows a banner ("This artist is marked as AI")
  instead of their songs.
- **When a mix page leaves fewer than 10 songs** after filtering, follow its
  continuation, up to 3 extra requests, and only while the switch is off.
  (The "no extra requests" anti-goal is about tagging, not this.)
- **Inside the library, AI is shown but held back:** in added playlists,
  saved albums, Liked Songs and downloads, AI songs show with the tag,
  greyed out, and are skipped when the playlist or album is played. Clicking
  one shows a small prompt, "AI music is off. Play anyway?". Confirming plays
  just that song and leaves the setting alone. The right-click menu has the
  same "Play anyway".
- **Switch on:** everything shows and plays normally; tags stay.

**User overrides.** Right-click on a song or artist: "Mark artist as AI" /
"Not AI" / "Reset". Stored locally, keyed by YouTube channel id. Also a
"Report to community list" link that opens the CennoxX submission form.

### 4. Reduced mode notice

When `status.spotify` is `degraded`, or `status.lists` is `stale`, or the
file is more than 7 days old:
- show a one-time toast, plus a persistent line under the switch;
- confirmed results keep working;
- new matches fall back to "AI?".

Copy:

> **AI detection is running in reduced mode.** Spotify changed something on
> their side that we use to confirm AI artists, so new matches show as "AI?"
> for now. This is outside our control, but we're working on a fix and it'll
> come back with an update.

When only the lists are stale, use the same message with "a community list we
rely on stopped updating" in place of the Spotify sentence. The job's
`status.message` may override the copy, so we can explain a specific outage
without an app release.

## Testing

- **Unit tests:** normalisation; the classification rules (confirmed, maybe,
  user overrides, multi-artist songs); filtering of search / home / queue
  results; the reduced-mode trigger, including the 7-day staleness rule.
- **Job tests:** fixture HTML for the Spotify embed, a broken-format fixture
  (it must report `degraded` and keep old data), and a fixture YouTube
  search.
- **Live smoke test** in the job: The Velvet Sundown, Xania Monet and Breaking
  Rust must come out confirmed. Queen must not appear at all. A failing smoke
  test fails the job, so the published file stays at the last good version.
- **Manual:** turn the switch off and check search, home, a radio mix and an
  artist page; check that library items keep their tags.

## Decided in conversation

- One switch; tags always on.
- With the switch off: AI is hidden everywhere except the user's library, where it shows greyed out, is skipped, and can be played on purpose ("Play anyway?").
- Use every source available, Spotify cross-check included.
- Same-name uncertain matches are "AI?" and never hidden.
- A degraded source shows an honest message rather than failing silently.

## My calls (flag any you disagree with)

- Default: AI music **on** (opt-in filtering).
- The Spotify and YouTube work runs in a daily GitHub job, not in the app.
- A song counts as AI if **any** credited artist is AI.

## Left to the builder

The exact file layout, the job's language (Node or Python), throttling
values, chip styling details, and where in each feed pipeline the filter
hooks in.
