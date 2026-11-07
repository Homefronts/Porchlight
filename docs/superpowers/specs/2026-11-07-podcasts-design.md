# Podcasts in Porchlight: design

Status: draft for the user's approval, 2026-11-07.
Mockup: `.superpowers/brainstorm/1451-1794059927/content/podcasts-tab.html` (real shows and episodes; progress and lengths made up).

## Why

The user listens to a lot of podcasts and wants Porchlight to support them fully. They follow a few shows closely: CreepCast, Unsubscribe Podcast, and they sometimes listen to YouTube video essays as podcasts (Wendigoon; not covered by this release, see Non-goals). Finding new shows is not the point. Following the shows they already love is. They press play and let an episode run in the background for a long time, stop partway, and come back later.

Today Porchlight has no podcasts: search drops Podcast and Episode results (`classifyAllRow` in `src/lib/innertube/search.ts`), and there is no show or episode page.

## Goals

1. **A Podcasts tab** in the title-bar nav, between Explore and Search: Home, Explore, Podcasts, Search, Library, Downloads, Rewind.
2. **The Podcasts page**, headed just "Podcasts" (no name after it; the user disliked "Podcasts, Sys0."). Three parts, in this order:
   - **Pick up where you left off:** episodes started and not finished, newest listened first, each with a progress bar and the time left.
   - **Your shows:** the shows the user follows; a dot marks a show with episodes they haven't played.
   - **New from your shows:** episodes from followed shows, newest first, each tagged NEW (not started), "N min left" (started), or "✓ Played".
3. **Resume and finish:** stopping partway saves the spot; playing it again continues from there; playing to the end marks it played.
4. **Mark as played / unplayed by hand**, for episodes heard elsewhere (e.g. on the phone). In the right-click and ⋯ menus of any episode, with Download and Open show.
5. **Playback is the same as music:** an episode plays as audio in the background; video mode shows its video at the same spot. An episode is a single video, so there is no song/video lookup.
6. **Downloads:** the Downloads page gets a switch at the top: Songs / Downloaded Episodes. Episodes download as audio, like songs.
7. **SponsorBlock sponsor skipping, off by default:**
   - A "Skip sponsors" button in the player, beside the speed and sleep controls, shown only while an episode plays. One click turns it on or off. Also in Settings > Playback.
   - When it skips, a small note: "Skipped sponsor (1:12)" with Undo, which jumps back to the start of that segment and doesn't skip it again this play.
   - Episodes only; it never touches songs.
   - Credited in the About section, per SponsorBlock's CC BY-NC-SA licence.
8. **Search shows podcasts and episodes** (needed to find and follow a show), and a **show page** listing a show's episodes with a Follow button.
9. **When an episode ends, the next one plays**, like a normal podcast app: the next episode of the same show in order (the one after it), skipping any already played. No music autoplay after an episode.
10. **Sort oldest first:** the show page's episode list and "New from your shows" each have a Newest / Oldest switch. *My call:* the show page remembers the choice per show (handy for working through a back catalogue), and "Up next" follows the episode order whichever way it's sorted.
11. **Every layout** (Liner, Crate, Gatefold, Index, Panels) shows the Podcasts page in its own style; the three parts are the same everywhere.

## Non-goals

- Podcast discovery: charts, recommendations, categories.
- RSS feeds or podcasts that aren't on YouTube.
- Ordinary YouTube channels and videos (e.g. Wendigoon's video essays) as podcasts. Only what YouTube lists as a podcast counts; Porchlight never shows every video. "Add any channel as a show" is a maybe, on the README roadmap under Someday.
- SponsorBlock on songs or music videos (the user dropped that on 2026-11-07).
- Changing Skip Silences (the user dislikes it; leave it as is).

## Anti-goals

- Losing the user's place in a long episode (an app restart, a crash, or switching to video must not lose it).
- Episodes leaking into music features: they must not count in Rewind, music stats, Last.fm scrobbles, "Listen again" or radio/autoplay of songs.
- Anything that skips audio without the user turning it on.

## Constraints

- Follow the existing stack and patterns: TanStack Router routes in `src/routes`, innertube parsing in `src/lib/innertube`, zustand persist stores, vitest tests.
- No em or en dashes in UI copy.
- HTML mockup with real data before any UI redesign; the Podcasts-tab mockup above is approved apart from the heading. The show page and the per-layout variants need their own mockups before they're built.
- Free accounts: playback follows the existing free-playback rules; no downloads for Free accounts (existing `useCanDownload`).
- SponsorBlock: call its public API with a hashed video-ID prefix (its privacy-preserving lookup), and only for episodes.

## Calls I made (the user can overrule)

- **"Your shows" = the podcasts saved to the user's YouTube Music library.** Following a show in Porchlight saves it there, so the phone and Porchlight agree.
- **Where progress lives:** saved locally first so it never gets lost. If YouTube Music's own resume position for an episode is readable, use whichever is further along, so listening on the phone carries over. "Mark as played" is local; it doesn't need to reach YouTube.
- **"Played"** = reached the last 30 seconds or so, or marked by hand. Mark as unplayed clears both played and progress.
- **Discord status** for an episode shows the show name instead of the artist.
- **Sleep timer, speed, the queue and crossfade** work on episodes like on songs; crossfade does not blend into or out of an episode.
- Downloaded episodes keep their saved spot offline. They extend the existing song download store (with an episode flag) rather than a second store, and their SponsorBlock segments are cached with them.
- **YouTube sync is optional:** if YouTube Music's resume position can't be read, "Pick up where you left off" is Porchlight-only. That's fine; build the local store first.
- **Follow falls back locally:** if saving a show to the YouTube Music library isn't possible, Porchlight keeps its own follow list. "Your shows" then reads both.
- **Thresholds:** an episode counts as started after 30 seconds of listening. It counts as played at 95% or the last 30 seconds, whichever comes first.
- **One source of truth:** progress and played state live in one store, so marking played updates the time left, the NEW tags and the dot on Your shows immediately, in every layout.
- **Skip sponsors is one global switch**, not per episode. Undo un-skips that one segment for the rest of this play.
- **What counts as an episode** is a flag set when the track is created, from YouTube's page type, not a guess at play time.

## Left to the builder

- How YouTube Music exposes followed podcasts, show pages, episode lists and resume positions (innertube browse IDs, page types), and the parsing for them.
- Where the progress and played state are stored, and how often the spot is saved.
- How "Pick up where you left off" handles episodes it can no longer load.
- The exact look of each layout's Podcasts page, within the mockup rule above.
