## Podcasts build: rulings and deferred minors (from the SDD ledger, 2026-11-07)

### Rulings
- Ruling: T4 leaves out "Open show"; T5 adds it to EpisodeMenuItems — route exists only after T5 — cost if wrong: one menu item moves.
- Ruling: T5 also renders search's "podcast" (cards to /podcast/$id) and "episode" (EpisodeRow) groups — spec goal 8 needs search to show them — cost if wrong: small extra UI in T5.
- Ruling: controller captures T1's fixtures itself via CDP in a dev build with the user's data backed up — user rule: back up data around any app run; subagents must not run the app on the real account — cost if wrong: none.
- Ruling: implementers skip "Check in the dev build" steps; controller runs all of them in one dev session after T8, with backup — same rule — cost if wrong: bugs found later, fixed in the final fix wave.
- Ruling: T0 mockups made now; T1-T4 proceed while the user reviews; T5/T6 wait for approval — mockup rule — cost if wrong: none.
- Task 1: Ruling: `published` can't be an ISO date (YouTube gives "23h ago"/"Oct 25" with no year) — add `publishedText?: string` carrying YouTube's own label for rows to show; keep `published` absent; sorting uses YouTube's list order — cost if wrong: rows show relative text instead of "NOV 1".
- Task 3: Ruling: next episode plays even with the auto-radio switch off — spec "when an episode ends, the next one plays", like a podcast app — cost if wrong: one line moves.
- Task 3: Ruling: episodes always resume their saved spot even with the "Resume playback" setting off — resuming an episode is the core podcast behaviour the user asked for; that setting is about restoring the queue — cost if wrong: one condition.
- Ruling: run Task 7 (SponsorBlock) before Tasks 5/6 — T5/T6 wait for the user's mockup approval; T7 shares nothing with them; T8 needs T5's EpisodeRow so it stays after T5 — cost if wrong: none.
- Task 7: Ruling: "Skip sponsors" toggle lives in the title-bar chips (playback-badges.tsx) beside the sleep/speed badges — the player has no speed/sleep controls; the badges are where those show — cost if wrong: move one button.
- Task 7: Ruling: SponsorBlock credit in about-dialog.tsx (where credits live) not settings-dialog — cost if wrong: none.
- Task 5: Ruling: playing episodes turns shuffle off before queueing (shared helper) — episodes must play in order like a podcast app; side effect: the listener's shuffle switch is off afterwards — cost if wrong: they re-enable shuffle for music.
- Task 6: Ruling: Index numbered section labels ("01 ·") from the approved mockup skipped — only Home varies by layout; no page-level layout mechanism exists and adding one is beyond the plan — cost if wrong: small visual difference on Index.
- Task 8: Ruling: Downloaded Episodes sort by download time (newest download first), not release date — YouTube gives no absolute release date — cost if wrong: an old episode downloaded today shows at the top.
- Ruling: Task 9 (README feature line) folds into the final fix dispatch with the final review's findings — one dispatch instead of two — cost if wrong: none.
- Final: Ruling: Oldest sort on a show page pages in the whole back catalogue (slow on huge shows, with a loading row) — oldest-first needs the earliest episodes, which YouTube only lists last — cost if wrong: a wait when sorting a huge show oldest-first.
- Final: Ruling: from search / New from your shows / Pick up / Downloads, queue only the chosen episode and let next-episode follow the show — spec goal 9 — cost if wrong: can't queue a mixed list by tapping.

### Deferred minors
- Task 1: minor (deferred): fetchShow returns an empty-title Show silently if the header is missing (podcasts.ts:318).
- Task 1: minor (deferred): pageTypeToKind still maps PODCAST_SHOW to "playlist" for other shelf parsers (shared.ts).
- Task 1: minor (deferred): podcast-search.json fixture unused by any test.
- Task 1: minor (deferred): search.ts ~151 `r.text.trim()` unguarded vs podcasts.ts String(r.text ?? "").
- Task 2: minor (deferred): byId never pruned and stores full QueueTrack; Task 3 should throttle record calls.
- Task 2: minor (deferred): no test that markUnplayed clears a position-played episode.
- Task 3: minor (deferred): Song/Video chip on an episode resumes from last 5 s save, not carried currentTime.
- Task 3: minor (deferred): flushPlaybackSave tiny window could write position 0 for a new episode.
- Task 3: minor (deferred): import cycle playback.ts <-> episodes.ts (safe today).
- Task 3: minor (deferred): Back on the first queued episode restarts and saves 0:00 as its place.
- Task 3: minor (deferred): OS media controls show the episode's artist line, not the show title.
- Task 4: minor (deferred): `Item: ComponentType<any>` loses type safety in EpisodeMenuItems.
- Task 7: minor (deferred): no unit test for the engine sponsor watcher.
- Task 5: minor (deferred): TopResultHero may not link a podcast top result to /podcast/$id (unverified).
- Task 5: minor (deferred): mis-indented played ternary in EpisodeMenuItems.
- Task 8: minor (deferred): concurrent syncSponsorCache can briefly re-add a removed episode's segments; cleaned on next sync.
- Final: minor (deferred): Song/Video chip on an episode loses up to 5 s.
- Final: minor (deferred): OS media controls show the artist line, not the show title.
- Final: minor (deferred): Mark as unplayed on the playing episode is refilled by the next 5 s save.
- Final: minor (deferred): show page Oldest paging fires back-to-back (sentinel always visible), skipping the 250 ms spacing.
- Final: minor (deferred): a failed continuation stops paging with no retry or message (Newest list just ends).
- Final: minor (deferred): infinite query revalidates every loaded page after 5 min (re-walks a drained JRE Oldest view in the background).
- Final: minor (deferred): queueNextEpisode doesn't write fetched pages back to the cache.
- Final: minor (deferred): podcast cards use the song/video corner radius.
