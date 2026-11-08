# Word-by-word lyrics: design

Status: draft for the user's approval, 2026-11-07.
Mockup: `.superpowers/mockups/word-lyrics/index.html` (git-ignored because it holds real lyrics; real Kugou word timings, NetEase romaji, Google translations). The user said "looks good".

## Why

Requested upstream in NUber's YTubic issue #120, and on our roadmap. Porchlight shows line-synced lyrics from YouTube Music, LRCLIB, Musixmatch and Genius; the whole line lights at once. People want karaoke-style lyrics where each word fills as it's sung, plus romanization for non-Latin scripts, translations, and duets split by singer. The #120 author writes their own TTML files and wants to use them. The user chose to do all of it in one release.

## Goals

1. **Word-by-word highlight.** When lyrics carry word timing, each word fills left to right across its own duration (mockup panel 1). Lines without word timing light whole, as today. A Settings switch turns word highlight off (whole lines only).
2. **New word-timed sources:**
   - **Kugou** (KRC: `lyrics.kugou.com/search` then `/download?fmt=krc`, base64, 4-byte header, XOR with the 16-byte KRC key, zlib).
   - **NetEase** (`music.163.com/api/search/get`, then `/api/song/lyric/v1?id=&lv=1&tv=1&rv=1&yv=1`; `yrc` is word-timed, `romalrc` is romanization, `lrc` is line-timed).
   - **LRCLIB's enhanced LRC** (`<mm:ss.xx>` word tags inside a line), when present.
   - **Your lyrics files:** pick a `.ttml` or `.lrc` file for the current song from the lyrics ⋯ menu ("Use a lyrics file…"). Porchlight copies it into app data, keyed by videoId, so it survives restarts and is preferred for that song (its place in the source order is the user's choice). A "Remove lyrics file" item undoes it.
3. **TTML parser** for Apple-style TTML: `<p begin end>` lines, `<span begin end>` words, `ttm:agent` singers (`v1`, `v2`, group), and background vocals (`ttm:role="x-bg"`) shown smaller under the line.
4. **Romanization** under the original line (panel 2): Japanese (kana and kanji), Korean, Chinese (pinyin), Cyrillic, Greek, and other non-Latin scripts a small table covers. Source-provided romanization (NetEase `romalrc`, Kugou's language block type 0) wins when present; otherwise it's made on the device. Japanese kanji uses a bundled reading dictionary (about 20 MB, user OK'd), loaded lazily the first time a Japanese song needs it.
5. **Translation** under that (panel 2 and 3): into a language picked in Settings (default English, or the app language once languages ship). Shown only when the lyrics' language differs from the target. Sent in one batched request per song to Google's `clients5.google.com/translate_a/t?client=dict-chrome-ex` (it worked in testing; `translate.googleapis.com` with `client=gtx` returned 429 from the user's connection). Cached per song and target language. If Google refuses, the translation line just isn't shown, with no error toast. Kugou and NetEase translations are Chinese only, so they aren't used.
6. **Duets** (panel 3): when the lyrics name singers (TTML agents), lines by the second singer sit on the right, with a small singer label when the singer changes. Group and "both" lines are centered. No source we found tags singers, so this appears only for TTML files; everything else uses the normal layout.
7. **Source order:** Settings gains a **Lyrics** tab with a drag-to-reorder list of sources (Your lyrics files, Kugou, NetEase, YouTube Music, LRCLIB, Musixmatch, Genius), each with an on/off switch and a WORD / LINE / TEXT badge. The first source in order with word timing wins; if none has it, the first with line timing, then plain text. The lyrics ⋯ menu lets you pick a different source just for the current song (remembered per song).
8. **Kugou and NetEase consent (the user's rule):** both ship **off**. After updating (and on a fresh install), a notice explains exactly what they receive and must be answered: **Accept** turns both on, **Decline** keeps them off. It cannot be closed by clicking outside, pressing Esc, or a close button. It's shown once per install until answered; the answer can be changed later in Settings > Lyrics, where the same explanation is repeated. The notice copy says they get each song's title, artist and length and, like any website, the computer's IP address, and never any account, cookies, logins or listening history.
9. **Defaults:** word-by-word on, romanization on, translation on (English).

## Non-goals

- Musixmatch word timing (`track.richsync.get` is not reachable with the desktop key: 404 "endpoint not found") and Better Lyrics' server (private, behind a Cloudflare check).
- Apple Music, Spotify or QQ Music lyrics.
- Editing or making lyrics in the app, or uploading lyrics to any service.
- Guessing duet singers from text.

## Anti-goals

- Any account, cookie, login, history or identifier going to Kugou or NetEase, or any request to them before the user clicks Accept.
- Lyrics for the wrong song: Kugou and NetEase results go through the same scoring and duration checks as LRCLIB and Musixmatch (`score.ts`, `match.ts`); a weak match is dropped, not shown.
- A slower lyrics panel: the new sources run in parallel with the existing ones under the same per-provider 8 s deadline, and the highlight runs off the existing position clock without per-word React re-renders on every frame.
- Errors that nag: a failed translation or romanization just leaves its line out.

## Constraints

- No em or en dashes in UI copy.
- Existing stack and patterns: providers in `src/lib/lyrics/`, `Lyrics` type in `types.ts`, `useLyricsSources` in `sources.ts`, the view in `src/components/layout/lyrics-view.tsx` (used by every layout and the floating and fullscreen players), settings in the zustand store, vitest tests with fixtures.
- Network calls go through `@tauri-apps/plugin-http` with the hosts added to `src-tauri/capabilities/default.json` (`lyrics.kugou.com`, `music.163.com`, `clients5.google.com`).
- The project is GPL-3.0, so GPL code (for example Better Lyrics' TTML handling) may be reused with credit; MIT libraries are fine.
- Lyrics persisted for 24 h in IndexedDB: bump `LOOKUP_VERSION` when the cached shape changes.
- Credit Kugou, NetEase and Google Translate as sources in About, like the others.

## Calls I made (the user can overrule)

- **Data shape:** `TimedLine` gains optional `words: {start, end, text}[]`, `agent?: string`, `bg?: TimedLine`, `roman?: string`, `translation?: string`. Line-only lyrics keep working unchanged.
- **Where romanization and translation come from, in order:** the source's own (Latin-script romanization only, never a Chinese translation), then on-device romanization, then Google for translation.
- **The consent notice is shown to everyone once**, update or fresh install, and comes after What's New on an update.
- **Per-song source pick and lyrics files are per videoId**, stored locally, not synced anywhere.
- **Language detection** for "is this in another language" uses script detection plus Google's detected source language from the same batched call; no separate detection request.
- **Japanese dictionary:** an MIT-licensed kuromoji-style dictionary shipped as a lazy-loaded asset, not downloaded at run time.
- **The Lyrics tab** holds the source list, the three switches, the target language and the Kugou/NetEase consent switch with its explanation.

## Left to the builder

- Exact romanization libraries (MIT or GPL-compatible), and how the dictionary is bundled.
- How the per-word fill is animated (CSS variable per word driven by the existing rAF clock is what the mockup does).
- How Kugou and NetEase results are scored against the track; how KRC/YRC credit lines ("Lyrics by…", "作词") are stripped.
- Layout details for each look and the fullscreen and floating players, keeping today's line styles.
