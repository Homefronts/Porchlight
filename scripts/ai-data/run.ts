/**
 * Daily AI artist data job. Run by .github/workflows/ai-data.yml:
 *
 *   npx -y tsx scripts/ai-data/run.ts <outDir> [--limit N]
 *
 * Reads the community lists, cross-checks each Spotify-listed artist
 * against its Spotify top tracks and its YouTube Music songs, and writes
 * <outDir>/ai-artists.json (what the app downloads) plus
 * <outDir>/state.json (per-artist results, so each run is incremental).
 * All decisions live in src/lib/ai/build.ts; this file is only I/O.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  channelsFromSongSearch,
  confirmedFromState,
  decideChannel,
  isDue,
  mergeResults,
  parseCsvArtists,
  parseSpotifyEmbed,
  parseYoutubeBlocklist,
  spotifyStatus,
} from "../../src/lib/ai/build";
import { normalizeName, type AiData } from "../../src/lib/ai/match";

const SOURCES = [
  {
    name: "spotify-ai-blocker by CennoxX",
    url: "https://github.com/CennoxX/spotify-ai-blocker",
    raw: "https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/main/SpotifyAiArtists.csv",
    license: "MIT",
    kind: "csv",
  },
  {
    name: "loved-music-ai-artists by gounetmusic",
    url: "https://github.com/gounetmusic/loved-music-ai-artists",
    raw: "https://raw.githubusercontent.com/gounetmusic/loved-music-ai-artists/main/ai-artists.csv",
    license: "CC BY 4.0",
    kind: "csv",
  },
  {
    name: "CevvalYoutubeAIBlocklist by CevvalKoala",
    url: "https://github.com/cevvalkoala/CevvalYoutubeAIBlocklist",
    raw: "https://raw.githubusercontent.com/cevvalkoala/CevvalYoutubeAIBlocklist/main/CevvalYoutubeAIblocklist.txt",
    license: "Unlicense",
    kind: "youtube",
  },
] as const;

// Always rechecked, and the smoke test requires them confirmed.
const SMOKE = ["The Velvet Sundown", "Xania Monet", "Breaking Rust"];
const MAX_PER_RUN = 2000;
const SPOTIFY_DELAY_MS = 1000;
// Mirrors WEB_REMIX_CLIENT_VERSION in src/lib/innertube/shared.ts.
const YTM_CLIENT = { clientName: "WEB_REMIX", clientVersion: "1.20260510.02.00", hl: "en", gl: "US" };
const SONGS_FILTER = "EgWKAQIIAWoQEAkQBRAKEAMQBBAQEBUQEQ==";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

type ArtistState = {
  name: string;
  checkedAt: string;
  spotifyOk: boolean;
  channels: Record<string, { name: string; verdict: "ai" | "maybe" }>;
};
type State = { artists: Record<string, ArtistState> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function text(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function ytmSongSearch(query: string, retries = 2): Promise<unknown> {
  try {
    return await ytmSongSearchOnce(query);
  } catch (e) {
    if (retries <= 0) throw e;
    await sleep(3000);
    return ytmSongSearch(query, retries - 1);
  }
}

async function ytmSongSearchOnce(query: string): Promise<unknown> {
  const body = JSON.stringify({ context: { client: YTM_CLIENT }, query, params: SONGS_FILTER });
  return JSON.parse(
    await text("https://music.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://music.youtube.com" },
    }),
  );
}

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
  } catch {
    return null;
  }
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("usage: run.ts <outDir> [--limit N]");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : MAX_PER_RUN;
  mkdirSync(outDir, { recursive: true });

  const prev = readJson<AiData>(join(outDir, "ai-artists.json"));
  const state = readJson<State>(join(outDir, "state.json")) ?? { artists: {} };

  // 1. Lists
  let listsStale = false;
  const spotifyArtists = new Map<string, string>(); // spotifyId → name
  const ytConfirmed: string[] = [];
  for (const s of SOURCES) {
    try {
      const body = await text(s.raw);
      if (s.kind === "csv") for (const a of parseCsvArtists(body)) spotifyArtists.set(a.spotifyId, a.name);
      else ytConfirmed.push(...parseYoutubeBlocklist(body));
    } catch (e) {
      listsStale = true;
      console.warn(`list failed: ${s.name}: ${e}`);
    }
  }
  console.log(`lists: ${spotifyArtists.size} spotify artists, ${ytConfirmed.length} youtube channels`);

  // 2. Pick this run's slice: smoke artists, never-checked, then oldest.
  const now = Date.now();
  const smokeNames = new Set(SMOKE.map(normalizeName));
  const ids = [...spotifyArtists.keys()];
  const smoke = ids.filter((id) => smokeNames.has(normalizeName(spotifyArtists.get(id)!)));
  const fresh = ids.filter((id) => !state.artists[id]);
  const stale = ids
    .filter((id) => state.artists[id] && isDue(state.artists[id], now))
    .sort((a, b) => Date.parse(state.artists[a].checkedAt) - Date.parse(state.artists[b].checkedAt));
  const todo = [...new Set([...smoke, ...fresh, ...stale])].slice(0, limit);
  console.log(`checking ${todo.length} artists`);

  // 3. Cross-check, one request at a time.
  let attempted = 0;
  let failed = 0;
  let parsedAny = false;
  for (const [i, id] of todo.entries()) {
    const name = spotifyArtists.get(id)!;
    let tracks: string[] | null = null;
    attempted++;
    // Spotify and YouTube Music are independent: fetch both at once.
    const [spRes, ytRes] = await Promise.allSettled([
      text(`https://open.spotify.com/embed/artist/${id}`, { headers: { "User-Agent": UA } }),
      ytmSongSearch(name),
    ]);
    const sp = spRes.status === "fulfilled" ? parseSpotifyEmbed(spRes.value) : null;
    if (sp) {
      tracks = sp.tracks;
      parsedAny = true;
    } else failed++;
    // Stop early rather than hammer a source that is clearly blocking us.
    if (attempted >= 20 && failed / attempted > 0.8) {
      console.warn("spotify failing; stopping early");
      break;
    }
    let channels: ArtistState["channels"] = state.artists[id]?.channels ?? {};
    if (ytRes.status === "fulfilled") {
      const found = channelsFromSongSearch(ytRes.value, name);
      channels = {};
      for (const [cid, c] of found) channels[cid] = { name: c.name, verdict: decideChannel(tracks, c.titles) };
    } else {
      console.warn(`ytm failed for ${name}: ${ytRes.reason}`);
    }
    // Search results vary run to run, and Spotify can fail: a channel
    // confirmed earlier is only downgraded by fresh evidence against it
    // (seen again, with Spotify data, and no song overlap).
    for (const [cid, c] of Object.entries(state.artists[id]?.channels ?? {})) {
      if (c.verdict === "ai" && (!tracks || !channels[cid])) channels[cid] = c;
    }
    state.artists[id] = { name, checkedAt: new Date().toISOString(), spotifyOk: !!tracks, channels };
    if (i % 100 === 99) console.log(`  ${i + 1}/${todo.length}`);
    await sleep(SPOTIFY_DELAY_MS);
  }

  // 4. Build the published file.
  const confirmed = confirmedFromState(state, new Set(spotifyArtists.keys()), ytConfirmed);
  const degraded = spotifyStatus(attempted, failed, parsedAny) === "degraded";
  const data = mergeResults(
    prev,
    {
      generatedAt: new Date().toISOString(),
      confirmed,
      maybeNames: [...spotifyArtists.values()].map(normalizeName),
      status: { spotify: degraded ? "degraded" : "ok", lists: listsStale ? "stale" : "ok", message: null },
      sources: SOURCES.map(({ name, url, license }) => ({ name, url, license })),
    },
    degraded,
  );

  // 5. Smoke test: refuse to publish data that misses the known cases.
  const confirmedNames = new Set(Object.values(data.confirmed).map(normalizeName));
  const missing = SMOKE.filter((n) => !confirmedNames.has(normalizeName(n)));
  if (missing.length && !degraded) throw new Error(`smoke test: not confirmed: ${missing.join(", ")}`);
  if (confirmedNames.has("queen")) throw new Error("smoke test: Queen is confirmed AI");

  writeFileSync(join(outDir, "state.json"), JSON.stringify(state));
  writeFileSync(join(outDir, "ai-artists.json"), JSON.stringify(data));
  console.log(
    `done: ${Object.keys(data.confirmed).length} confirmed, ${data.maybeNames.length} maybe, spotify ${data.status.spotify}, lists ${data.status.lists}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
