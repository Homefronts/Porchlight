# Word-by-word Lyrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karaoke-style word-by-word lyrics with romanization, translation, duets, a user-ordered source list, lyrics files, and Kugou/NetEase behind a must-answer consent.

**Architecture:** `TimedLine` gains optional word, singer, background, romanization and translation fields, so every existing provider keeps working. New parsers (TTML, enhanced LRC, KRC, YRC) and providers (Kugou, NetEase, your files) plug into `useLyricsSources`. A new lyrics-settings store owns source order, switches and consent. An enrichment step adds romanization and translation, and `lyrics-view.tsx` paints the word fill from its existing rAF clock.

**Tech Stack:** React 19, TS, TanStack Query, zustand persist, vitest, `@tauri-apps/plugin-http`, idb-keyval (installed), new deps `pinyin-pro@3.29.5`, `kuroshiro@1.2.1` and `kuroshiro-analyzer-kuromoji@1.1.0` (all MIT).

**Spec:** `docs/superpowers/specs/2026-11-07-word-lyrics-design.md` (mockup `.superpowers/mockups/word-lyrics/index.html`, git-ignored).

## Global Constraints

- No em or en dashes in any UI copy.
- Nothing is sent to `lyrics.kugou.com` or `music.163.com` unless `chineseConsent === "accepted"` and that source is switched on. Never send cookies, account data or history to them: plain `fetch` from `@tauri-apps/plugin-http`, no credentials, no extra headers beyond a generic `User-Agent: Mozilla/5.0`.
- The consent notice can't be dismissed by outside click, Esc or a close button. Only Accept and Decline close it.
- Defaults: word-by-word on, romanization on, translation on, target `"en"`, Kugou and NetEase off, consent `"unasked"`.
- Translation endpoint: `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=<lang>&q=<line>&q=<line>...` (GET; the reply is an array of `[translated, detectedLang]` per `q`). Failures show nothing, with no toast.
- Allowlist in `src-tauri/capabilities/default.json`: `https://lyrics.kugou.com/*`, `https://music.163.com/*`, `https://clients5.google.com/*`.
- Every provider runs under the existing 8 s deadline (`createDeadline`/`lyricsFetch` in `src/lib/lyrics/http.ts`) and the existing failure semantics: `null` means no lyrics, a throw means it couldn't answer.
- Kugou and NetEase matches go through `selectBest` (`src/lib/lyrics/score.ts`) with the track's cleaned title, artist and duration.
- Bump `LOOKUP_VERSION` in `src/lib/lyrics/sources.ts` to `"v4"`.
- Test fixtures use made-up lyrics only (no real song text in the repo). Tests that need KRC build it with an encoder helper in the test file.
- Log every change in `docs/superpowers/handoffs/2026-10-31-full-project.md`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave `src-tauri/Cargo.toml` line-ending noise out of commits.
- Subagents never launch the app on the user's real account.

## Review Focus

1. **Wrong song from Kugou/NetEase** (a cover, live version or same-title song by someone else): it must be dropped, never shown. Pinned in Task 3 tests.
2. **Messy word timing** (zero-length words, words past the line end, overlapping words, a line with words and no line end): the fill must stay between 0 and 100% with no NaN, and the line still ends. Pinned in Task 1 and Task 7 tests.
3. **Scrubbing or seeking mid-line:** the fill follows the scrub position, not just playback. Pinned in Task 7 (`wordFill` takes the same `position` the view already computes from `scrub ?? playbackPosition`).
4. **Mixed-language songs** (an English song with one Spanish line, or a K-pop song with English lines): translate only the lines whose detected language differs from the target, and romanize only lines with non-Latin script. Pinned in Task 5 and Task 6.
5. **Consent never answered or declined:** zero requests to the Kugou or NetEase hosts. Pinned in Task 2 (`enabledSources`) and Task 3 (providers throw if called without consent, as a guard).

---

### Task 1: Types and parsers

**Files:**
- Modify: `src/lib/lyrics/types.ts`, `src/lib/lyrics/parse-lrc.ts`
- Create: `src/lib/lyrics/parse-ttml.ts`, `src/lib/lyrics/parse-krc.ts`, `src/lib/lyrics/parse-yrc.ts`
- Test: `src/lib/lyrics/parse-ttml.test.ts`, `parse-krc.test.ts`, `parse-yrc.test.ts`, and additions to `parse-lrc.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TimedWord = { start: number; end: number; text: string }; // seconds; text keeps its trailing space
  export type TimedLine = {
    start: number; end?: number; text: string;
    words?: TimedWord[];      // present only when the source has word timing
    agent?: string;           // singer id ("v1", "v2", "v1000" for group), TTML only
    bg?: TimedLine;           // background vocals under this line
    roman?: string;           // source-provided romanization
    translation?: string;     // filled by Task 6
  };
  export type Lyrics =
    | { kind: "timed"; lines: TimedLine[]; source?: string; agents?: Record<string, string> } // agent id -> singer name
    | { kind: "plain"; text: string; source?: string };
  export function parseTTML(xml: string): Lyrics | null;          // parse-ttml.ts
  export async function decodeKRC(base64: string): Promise<string>; // parse-krc.ts; zlib via DecompressionStream("deflate") (browser and Node)
  export function parseKRC(text: string): { lines: TimedLine[]; romanByLine: (string | null)[] };
  export function parseYRC(yrc: string): TimedLine[];             // parse-yrc.ts
  export function hasWordTiming(l: Lyrics | null | undefined): boolean; // types.ts
  ```
  `parseLRC` (existing signature) now also fills `words` from enhanced `<mm:ss.xx>` tags.

- [ ] **Step 1: Write failing tests**
  - `parse-ttml.test.ts`:
    - `"reads lines, words and singers"`: a TTML string with `<ttm:agent xml:id="v1">` named "Ana" and `v2` named "Ben", `<p begin="00:01.000" end="00:03.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500">Hello </span><span begin="00:01.500" end="00:03.000">sun</span></p>` → one line `{start:1, end:3, text:"Hello sun", agent:"v1", words:[{start:1,end:1.5,text:"Hello "},{start:1.5,end:3,text:"sun"}]}`, with `agents` `{v1:"Ana", v2:"Ben"}`.
    - `"puts background vocals under their line"`: a nested `<span ttm:role="x-bg">` becomes `bg` with its own words, and is excluded from the main `text`.
    - `"accepts h:m:s, m:s and plain-seconds times"`: `begin="1:02:03.5"` → 3723.5, `"02:03.5"` → 123.5, `"7.25s"` → 7.25.
    - `"line-timed TTML has no words"`: `<p>` with text only → `words` undefined.
    - `"garbage returns null"`.
  - `parse-krc.test.ts`: the helper `encodeKRC(text)` does the inverse of `decodeKRC` (zlib deflate, XOR with key `[64,71,97,119,94,50,116,71,81,54,49,45,206,210,110,105]`, prefix `"krc1"`, base64).
    - `"decodes and reads word offsets relative to the line"`: `[1000,2000]<0,500,0>Hello <500,1500,0>sun` → line start 1, end 3, words `[1,1.5]` and `[1.5,3]`.
    - `"drops credit lines"`: lines whose text starts with `Lyrics by`, `Composed by`, `作词`, `作曲`, `编曲` or contains `：`/`:` within the first 12 chars before the first real lyric, and the first line if it equals `<title> - <artist>`, are removed.
    - `"reads romanization from the language block"`: a `[language:<base64 json>]` with `content:[{type:0, lyricContent:[["ro ","ma"]]},{type:1, lyricContent:[["译文"]]}]` → `romanByLine[0] === "roma"`; the type 1 (Chinese translation) is ignored.
  - `parse-yrc.test.ts`: `{"t":0,"c":[{"tx":"作词: "},{"tx":"X"}]}\n[1000,2000](1000,500,0)Hello (1500,1500,0)sun` → JSON header lines dropped, one line with words `[1,1.5]`,`[1.5,3]`.
  - `parse-lrc.test.ts` addition: `"[00:01.00]<00:01.00>Hello <00:01.50>sun<00:03.00>"` → `words` `[{1,1.5,"Hello "},{1.5,3,"sun"}]` and `text` `"Hello sun"`; a line with no tags has no `words`.
  - `types.ts` test inline in `parse-ttml.test.ts`: `hasWordTiming` is true only when some line has `words.length > 0`.
  - Review Focus 2: `"repairs messy word timing"` in `parse-krc.test.ts`: a zero-length word gets `end = next.start` (or line end), a word past the line end is clamped to the line end, and the words stay in order.

- [ ] **Step 2: Run, expect FAIL** `pnpm vitest run src/lib/lyrics/parse-` (missing modules).
- [ ] **Step 3: Implement.** Parse TTML with `DOMParser` (`"application/xml"`). Vitest runs in `node`, so `parse-ttml.test.ts` starts with `// @vitest-environment jsdom` (jsdom 26.1.0 is installed). The test helper `encodeKRC` uses `CompressionStream("deflate")`. Share one `repairWords(words, lineStart, lineEnd)` helper in `types.ts` for the clamping rules, used by every parser.
- [ ] **Step 4: Run, expect PASS**, then `pnpm vitest run src/lib/lyrics` stays green.
- [ ] **Step 5: Commit** `feat(lyrics): word-timed types and TTML, KRC, YRC, enhanced LRC parsers`.

### Task 2: Lyrics settings store

**Files:**
- Create: `src/lib/store/lyrics-settings.ts`, `src/lib/store/lyrics-settings.test.ts`
- Modify: `src/lib/lyrics/sources.ts` (move the `LyricsSource` union and `SOURCE_LABELS` here or re-export; one definition only)

**Interfaces:**
- Produces:
  ```ts
  export type LyricsSource = "file" | "kugou" | "netease" | "ytmusic" | "lrclib" | "musixmatch" | "genius";
  export const DEFAULT_ORDER: LyricsSource[] = ["file","kugou","netease","ytmusic","lrclib","musixmatch","genius"];
  export const CHINESE_SOURCES: LyricsSource[] = ["kugou","netease"];
  export type Consent = "unasked" | "accepted" | "declined";
  type LyricsSettings = {
    order: LyricsSource[]; off: LyricsSource[];
    wordByWord: boolean; romanize: boolean; translate: boolean; targetLang: string;
    chineseConsent: Consent;
    perSong: Record<string, LyricsSource>; // videoId -> picked source
    setOrder(o: LyricsSource[]): void; setOn(s: LyricsSource, on: boolean): void;
    setWordByWord(v: boolean): void; setRomanize(v: boolean): void; setTranslate(v: boolean): void; setTargetLang(l: string): void;
    answerConsent(accept: boolean): void; // accepted -> removes kugou/netease from off; declined -> adds them
    pickForSong(videoId: string, s: LyricsSource | null): void; // null = auto
  };
  export const useLyricsSettings; // zustand persist, name "ytm-lyrics-settings", version 1
  export function enabledSources(s: Pick<LyricsSettings,"order"|"off"|"chineseConsent">): LyricsSource[];
  export const TARGET_LANGS: { code: string; label: string }[]; // en, es, pt-BR, fr, de, it, uk, ru, tr, id, hi, ja, ko
  ```
- [ ] **Step 1: Failing tests:**
  - `"Kugou and NetEase start off and need consent"`: defaults give `off` containing both, `chineseConsent "unasked"`; `enabledSources` excludes them.
  - `"accepting turns both on; declining keeps them off"`.
  - `"switched on without consent still stays out"`: `off` empty but consent `"declined"` → `enabledSources` has no kugou/netease (Review Focus 5).
  - `"order is kept, unknown or missing sources are repaired"`: a persisted `order` missing `"file"` gets it appended; unknown names are dropped.
  - `"migrates the old global pin"`: with `localStorage["ytm:lyrics-source"] = "lrclib"` before first load, `order[0]` is `"lrclib"` and the old key is removed; `"auto"` or missing leaves `DEFAULT_ORDER`.
- [ ] **Step 2: FAIL. Step 3: Implement** (persist `migrate`/`merge` does the repair; the old-pin migration runs in `onRehydrateStorage` only when no `ytm-lyrics-settings` existed). **Step 4: PASS. Step 5: Commit** `feat(lyrics): lyrics settings store`.

### Task 3: Kugou and NetEase providers

**Files:**
- Create: `src/lib/lyrics/kugou.ts`, `src/lib/lyrics/netease.ts`, tests `kugou.test.ts`, `netease.test.ts`
- Modify: `src-tauri/capabilities/default.json` (two hosts)

**Interfaces:**
- Consumes: Task 1 parsers; `selectBest`, `createDeadline`, `lyricsFetch`, `throwForStatus` from existing modules; `enabledSources`/`useLyricsSettings` from Task 2.
- Produces: `fetchKugouLyrics(p: {title: string; artist?: string; duration?: number}, signal?: AbortSignal): Promise<Lyrics | null>` and `fetchNeteaseLyrics(...)` with the same signature. Each sets `source` to `"kugou"`/`"netease"`, and fills `roman` on lines from the source's romanization. Each throws `Error("consent")` if called while `enabledSources(useLyricsSettings.getState())` lacks it.
- Kugou: `GET https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=<artist> - <title>&duration=<ms>` → `candidates[]` (`song`, `singer`, `duration` ms, `id`, `accesskey`); score with `selectBest` (map to `trackName/artistName/duration` seconds, `bodyUnknown: true`); then `GET /download?ver=1&client=pc&id=&accesskey=&fmt=krc&charset=utf8` → `content` → `decodeKRC` → `parseKRC`.
- NetEase: `GET https://music.163.com/api/search/get?s=<artist> <title>&type=1&limit=10` → `result.songs[]` (`name`, `artists[0].name`, `duration` ms, `id`); `selectBest`; then `GET /api/song/lyric/v1?id=&lv=1&tv=1&rv=1&yv=1`: `yrc.lyric` → `parseYRC` (word), else `lrc.lyric` → `parseLRC` (line); `romalrc.lyric` lines are matched to lyric lines by the nearest start within 0.6 s and kept exactly as NetEase spaces them. `tlyric` (Chinese) is ignored.
- [ ] **Step 1: Failing tests** (mock `@tauri-apps/plugin-http` `fetch` the way `failure-semantics.test.ts` does):
  - `"Kugou: picks the matching song and returns word lines"` (made-up lyrics, KRC built with the Task 1 encoder).
  - `"Kugou: a cover by someone else is dropped"` (Review Focus 1): the only candidate is `singer: "Cover Band"`, so `null`, and `/download` is never requested.
  - `"Kugou: no candidates is null; HTTP 503 throws"`.
  - `"NetEase: prefers yrc, falls back to lrc, attaches romalrc"`.
  - `"NetEase: duration far off is dropped"`.
  - `"both refuse to run without consent"`: default settings → rejects with `consent`, and the fetch mock was never called.
- [ ] **Step 2: FAIL. Step 3: Implement** with the shapes above. **Step 4: PASS. Step 5: Commit** `feat(lyrics): Kugou and NetEase providers`.

### Task 4: Your lyrics files, and wiring every source into `useLyricsSources`

**Files:**
- Create: `src/lib/lyrics/user-files.ts`, `user-files.test.ts`, `src/lib/lyrics/pick.ts`, `pick.test.ts`
- Modify: `src/lib/lyrics/sources.ts`, `src/components/layout/lyrics-view.tsx` (only `useLyricsView`: pref handling), `src-tauri/capabilities/default.json` unchanged here

**Interfaces:**
- Produces:
  ```ts
  // user-files.ts (idb-keyval, key `lyrics-file:<videoId>`, value {name, text, savedAt})
  export async function saveLyricsFile(videoId: string, file: { name: string; text: string }): Promise<Lyrics | null>; // parses by extension; null = unreadable, not saved
  export async function loadLyricsFile(videoId: string): Promise<Lyrics | null>;
  export async function removeLyricsFile(videoId: string): Promise<void>;
  // pick.ts
  export type Availability = "word" | "line" | "plain" | "loading" | "none" | "error";
  export function availabilityOf(data: Lyrics | null | undefined, isLoading: boolean, isError: boolean): Availability;
  export function pickSource(order: LyricsSource[], avail: Record<LyricsSource, Availability>, songPick?: LyricsSource): LyricsSource | null;
  ```
  `useLyricsSources` returns the same shape as today, but `queries` is keyed by the 7-source union, queries run only for `enabledSources(...)`, and `best = pickSource(...)`. `useLyricsView`'s `pref` is replaced by `perSong[videoId] ?? "auto"`, and `setPref` writes `pickForSong`. `Availability` `"lrc"` becomes `"word"`/`"line"` (update `LyricsSourceButton`'s dot colours: word and line use `bg-brand`, word also gets the WORD label in Task 8).
- [ ] **Step 1: Failing tests:**
  - `pick.test.ts`: `"first word-timed source in order wins over an earlier line source"` (order `[ytmusic(line), kugou(word)]` → kugou); `"no word timing anywhere: first line source"`; `"plain only: first plain"`; `"a song pick wins if it has anything"`; `"a song pick with none falls back to auto"`; `"a source still loading is skipped"`: with `[file(loading), lrclib(line)]` it returns `lrclib`. (`useLyricsSources` then keeps showing what it has; when an earlier-ordered source finishes with better lyrics it takes over, which is today's behaviour too.)
  - `user-files.test.ts` (mock idb-keyval with an in-memory map): `.ttml` and `.lrc` parse and save; `.txt` or a broken file returns `null` and saves nothing; remove deletes.
- [ ] **Step 2: FAIL. Step 3: Implement.** Add queries for `kugou`, `netease` (keys include `LOOKUP_VERSION "v4"`, title, artist, duration; `enabled` only when in `enabledSources`) and `file` (key `["lyrics","file",videoId]`, `staleTime: Infinity`, invalidated by save/remove). **Step 4: PASS** plus the full suite. **Step 5: Commit** `feat(lyrics): source order, song picks and lyrics files`.

### Task 5: Romanization on the device

**Files:**
- Create: `src/lib/lyrics/romanize.ts`, `romanize-korean.ts`, `romanize-table.ts`, `romanize.test.ts`
- Modify: `package.json` (add `pinyin-pro@3.29.5`, `kuroshiro@1.2.1`, `kuroshiro-analyzer-kuromoji@1.1.0`), `vite.config.ts` (copy `node_modules/kuromoji/dict` to `dist/kuromoji-dict` at build and serve it in dev, for example with a small `configureServer`/`generateBundle` plugin or `vite-plugin-static-copy` if already installed; ledger which)

**Interfaces:**
- Produces:
  ```ts
  export function needsRomanization(text: string): boolean; // any Han, Kana, Hangul, Cyrillic, Greek, Thai, Arabic, Hebrew, Devanagari letters
  export function scriptOf(text: string): "ja" | "ko" | "zh" | "cyrl" | "grek" | "other" | "latin"; // kana present -> ja; Hangul -> ko; Han only -> zh
  export async function romanizeLines(lines: string[]): Promise<(string | null)[]>; // null for Latin lines or when it fails
  ```
  Japanese via kuroshiro (`to: "romaji", mode: "spaced"`), with the analyzer's `dictPath` set to `/kuromoji-dict/`, lazily initialised once on the first Japanese line; a failed init resolves those lines to `null`, never throws. Korean via Revised Romanization in `romanize-korean.ts` (Hangul syllable decomposition, initial/medial/final tables, the common assimilation rules for ㄱ/ㄷ/ㅂ + ㄴ/ㅁ and ㄹ). Chinese via `pinyin(text, { toneType: "symbol", type: "string" })`. Cyrillic and Greek via a letter table in `romanize-table.ts`.
- [ ] **Step 1: Failing tests:** `"Korean"`: `"사랑해" → "saranghae"`, `"한국어" → "hangugeo"`. `"Russian"`: `"Я тебя люблю" → "Ya tebya lyublyu"`. `"Chinese"`: `"你好" → "nǐ hǎo"`. `"Latin and mixed lines"` (Review Focus 4): `["Hello", "Baby 사랑해"]` → `[null, "Baby saranghae"]` (Latin runs kept as is). `"Japanese kana without the dictionary"`: with the kuroshiro init mocked to reject, `["こんにちは"]` → `[null]` and nothing throws. One real-dictionary test, `"Japanese with kanji"`: `"夢を見る" → "yume wo miru"` loading the dictionary from `node_modules/kuromoji/dict` (allowed to take up to 15 s; mark with a timeout).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `feat(lyrics): on-device romanization`.

### Task 6: Translation

**Files:**
- Create: `src/lib/lyrics/translate.ts`, `translate.test.ts`
- Modify: `src-tauri/capabilities/default.json` (`https://clients5.google.com/*`)

**Interfaces:**
- Produces: `export async function translateLines(lines: string[], target: string, signal?: AbortSignal): Promise<(string | null)[]>`. One GET per batch of up to 40 lines or 3500 URL-encoded characters. It returns `null` for a line whose detected language equals `target` (compare the primary subtag, so `pt-BR` matches `pt`), whose text is empty or just `♪`, or whose translation equals the original ignoring case and punctuation. Any HTTP or parse failure resolves to all `null`, with no throw and no toast.
- [ ] **Step 1: Failing tests** (mock fetch): `"batches and maps answers back"` (45 lines → 2 requests, order kept); `"skips lines already in the target language"` (Review Focus 4: reply `[["Hi","en"],["I know what I want","es"]]` with target `en` → `[null, "I know what I want"]`); `"a 429 gives all null"`; `"empty and ♪ lines are not sent"`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `feat(lyrics): translation`.

### Task 7: Enrichment and the word-fill math

**Files:**
- Create: `src/lib/lyrics/enrich.ts`, `enrich.test.ts`, `src/lib/lyrics/word-fill.ts`, `word-fill.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // enrich.ts
  export function useEnrichedLyrics(lyrics: Lyrics | null, videoId: string | undefined): Lyrics | null;
  // react-query keys ["lyrics-roman", videoId, source] and ["lyrics-tr", videoId, source, targetLang]; staleTime Infinity, gcTime 24 h.
  // Returns the input unchanged at first, then a copy with roman (source roman wins, else device) and translation per settings.
  export function mergeEnrichment(l: Lyrics, roman: (string | null)[] | undefined, tr: (string | null)[] | undefined, opts: { romanize: boolean; translate: boolean }): Lyrics;
  // word-fill.ts
  export function wordFill(w: TimedWord, position: number): number; // 0..1, clamped, a zero-length word is 0 before and 1 at or after start
  export function lineAlign(agent: string | undefined, agents: Record<string,string> | undefined): "left" | "right" | "center";
  // first agent seen in the song -> left, any other single singer -> right, an agent named in TTML as a group (id "v1000" or type="group") -> center; no agents -> left
  ```
- [ ] **Step 1: Failing tests:** `wordFill` at start, mid, end, before, after, a zero-length word, and NaN-safe for `end < start` (Review Focus 2/3). `lineAlign` for v1/v2/group/none. `mergeEnrichment`: switches off → no `roman`/`translation`; source `roman` kept over device; translation only where non-null; plain lyrics are returned unchanged.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `feat(lyrics): enrichment and word fill`.

### Task 8: The lyrics view and its ⋯ menu

**Files:**
- Modify: `src/components/layout/lyrics-view.tsx`
- Test: `src/components/layout/lyrics-view-words.test.ts` (pure helpers only, if any are extracted)

**Interfaces:**
- Consumes: `useEnrichedLyrics`, `wordFill`, `lineAlign` (Task 7); `useLyricsSettings` (Task 2); `saveLyricsFile`/`removeLyricsFile` (Task 4).
- Behaviour, matching mockup panels 1 to 4:
  - `useLyricsView` returns `active` passed through `useEnrichedLyrics`.
  - With `wordByWord` on and the line has `words`: render each word as a `<span data-w>` inside the line button. The existing rAF loop in `TimedLyrics` (or a second rAF while the track plays) sets `--p` (`0%..100%`) on the active line's word spans from `wordFill(word, position)`, with no React state per frame. CSS (in `index.css`, next to `.lyrics-line`): a word paints with `background: linear-gradient(90deg, currentColor var(--p), <dim> var(--p))` clipped to text, where the dim colour is the line's inactive colour for that look. Past lines show fully filled words in the past colour, upcoming lines unfilled. When `wordByWord` is off, words render as plain text, as today.
  - `roman` renders under the line text (smaller, `text-[0.55em]`, muted), then `translation` (italic, muted), both inside the same button so clicking seeks. The `bg` line renders after them, smaller.
  - `lineAlign` sets `self-end text-right origin-right` for "right" and `self-center text-center origin-center` for "center"; a small singer label (`agents[agent]`, uppercase, `text-[10px]` tracking) appears above the first line of each new singer.
  - `LyricsSourceButton` menu becomes: label "Source for this song"; Auto (with the best source's name); each enabled source with its availability (`WORD`, `LINE`, `TEXT` badge text on the right, dot as today; a disabled-by-consent source is not listed); separator; "Show romanization" and "Translate to <language label>" as checkbox items bound to the settings; separator; "Use a lyrics file…" (a hidden `<input type="file" accept=".ttml,.lrc,.xml">`; on success it picks `file` for this song and toasts "Lyrics file added"; an unreadable file toasts "That file couldn't be read as lyrics"); "Remove lyrics file" when one exists for this song.
- [ ] **Step 1:** Extract and unit-test any new pure helper (for example `singerLabelAt(lines, i)`: label only when the agent differs from the previous line's). **Step 2: FAIL. Step 3: Implement. Step 4:** `pnpm vitest run`, `pnpm tsc --noEmit`, `pnpm eslint src/components/layout/lyrics-view.tsx` clean. Visual check is the controller's dev-build step after Task 10, not the subagent's. **Step 5: Commit** `feat(lyrics): word-by-word view, romanization, translation, duets`.

### Task 9: Settings > Lyrics tab

**Files:**
- Create: `src/components/settings/lyrics-tab.tsx`
- Modify: `src/lib/store/settings-dialog.ts` (add `"lyrics"` to `SettingsTab`), `src/components/settings/settings-dialog.tsx` (tab entry after Playback, icon `IconMicrophone` from tabler)

**Interfaces:**
- Consumes: `useLyricsSettings`, `DEFAULT_ORDER`, `CHINESE_SOURCES`, `TARGET_LANGS` (Task 2).
- Content, top to bottom (copy is exact):
  - Group "Source order": description "Drag to choose which source is tried first. Word-by-word lyrics win over line-by-line ones." A drag list built the way `HomeConfigureDialog` does it (`src/components/shared/home-configure-dialog.tsx:80-115`): each row has a grip, the label (`Your lyrics files`, `Kugou`, `NetEase`, `YouTube Music`, `LRCLIB`, `Musixmatch`, `Genius`), a fixed badge (`WORD` for file, kugou and netease; `LINE` for ytmusic, lrclib and musixmatch; `TEXT` for genius), and a Switch. The Kugou and NetEase switches are disabled until consent is accepted.
  - Row "Kugou and NetEase": description "Two music services based in China with word-by-word lyrics. When on, they get each song's title, artist and length, and see your IP address like any website. Never your accounts, logins or listening history." Control: a Switch bound to consent (on = `answerConsent(true)`, off = `answerConsent(false)`).
  - Row "Word-by-word highlight": "Off lights up whole lines, like before."
  - Row "Show romanization": "Japanese, Korean, Chinese, Russian and more, in Latin letters."
  - Row "Translate lyrics": "Adds a translation under songs in another language." Switch, plus a select of `TARGET_LANGS` shown when on.
- [ ] **Step 1:** Test the pure reorder helper if it isn't shared (`moveItem(list, from, to)` from the Home dialog, if exported, is reused; otherwise export it there and test it once). **Step 2-4** as usual, plus `tsc` and `eslint`. **Step 5: Commit** `feat(settings): Lyrics tab`.

### Task 10: The consent notice, credits and docs

**Files:**
- Create: `src/components/layout/chinese-sources-consent.tsx`, `src/lib/consent-gate.ts`, `consent-gate.test.ts`
- Modify: `src/components/layout/app-shell.tsx` (mount next to `WhatsNewDialog`), `src/components/layout/about-dialog.tsx` (credits), `README.md` (Features bullet under Lyrics; remove the roadmap item "Word-by-word lyrics"), `docs/superpowers/handoffs/2026-10-31-full-project.md`

**Interfaces:**
- Produces: `export function shouldShowConsent(s: { consent: Consent; pickerSeen: boolean; whatsNewOpen: boolean; makeItYoursOpen: boolean }): boolean` (true only when `consent === "unasked"`, the picker is done, and neither dialog is open).
- The dialog: `<Dialog open>` with `DialogContent showCloseButton={false} onInteractOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>e.preventDefault()}`, as in `src/components/theme/make-it-yours.tsx:99-112`. Exact copy:
  - Title: "Word-by-word lyrics from Kugou and NetEase"
  - Body 1: "Porchlight can get word-by-word lyrics from Kugou and NetEase, two music services based in China."
  - Body 2: "If you accept, for each song you play they receive its title, artist and length. Like any website, they also see your computer's IP address. They never get your name, accounts, cookies, logins or listening history."
  - Body 3: "You can change this any time in Settings > Lyrics."
  - Buttons: "Decline" (outline) and "Accept" (primary); each calls `answerConsent(...)`.
- About credits (same list as LRCLIB): `{ name: "Kugou", role: "word-by-word lyrics", url: "https://www.kugou.com" }`, `{ name: "NetEase Cloud Music", role: "word-by-word lyrics", url: "https://music.163.com" }`, `{ name: "Google Translate", role: "lyrics translation", url: "https://translate.google.com" }`, `{ name: "kuroshiro", role: "Japanese romanization", url: "https://github.com/hexenq/kuroshiro" }`, `{ name: "pinyin-pro", role: "Chinese romanization", url: "https://github.com/zh-lx/pinyin-pro" }`.
- README Features (Lyrics section) bullet: "**Word-by-word lyrics**: karaoke-style highlighting from Kugou, NetEase, LRCLIB or your own TTML and LRC files, with romanization, translation, duets split by singer, and a source order you choose. Kugou and NetEase are off until you accept them."
- [ ] **Step 1: Failing tests** for `shouldShowConsent`: unasked and clear → true; accepted or declined → false; What's New open → false; picker not seen (fresh install mid-onboarding) → false. **Step 2: FAIL. Step 3: Implement. Step 4:** full suite, `tsc`, `eslint`. **Step 5: Commit** `feat(lyrics): Kugou and NetEase consent, credits, docs`.

### Task 11 (controller only): dev-build check and final review

- Back up the user's data first (the 2026-11-07 scrobblers recipe in the handoff), run the dev build with CDP, and with the user: answer the consent notice (check it can't be dismissed), play "Tommy's Party" (word fill), "Lemon" (romaji and English), and a TTML file with two singers (duet layout); check Settings > Lyrics order and switches. Restore the links, then verify the data.
- Final whole-branch review on the most capable model, against this plan's Review Focus.
