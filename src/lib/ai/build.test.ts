import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideChannel,
  mergeResults,
  parseCsvArtists,
  parseSpotifyEmbed,
  parseYoutubeBlocklist,
  channelsFromSongSearch,
  confirmedFromState,
  spotifyStatus,
  isDue,
} from "./build";
import type { AiData } from "./match";

const fixture = (f: string) =>
  readFileSync(join(process.cwd(), "src/lib/ai/fixtures", f), "utf8");

describe("parseSpotifyEmbed", () => {
  it("reads the artist name and top tracks", () => {
    const r = parseSpotifyEmbed(fixture("spotify-embed.html"));
    expect(r?.name).toBe("The Velvet Sundown");
    expect(r?.tracks[0]).toBe("Dust on the Wind");
  });
  it("returns null when the page format changed", () => {
    expect(parseSpotifyEmbed(fixture("spotify-embed-broken.html"))).toBeNull();
    expect(parseSpotifyEmbed("<html></html>")).toBeNull();
  });
});

describe("decideChannel", () => {
  it("confirms on an overlapping song title", () => {
    expect(
      decideChannel(["Dust on the Wind"], ["Dust On The Wind (Official Audio)"]),
    ).toBe("ai");
  });
  it("is maybe without overlap or Spotify data", () => {
    expect(decideChannel(["Dust on the Wind"], ["Something Else"])).toBe("maybe");
    expect(decideChannel(null, ["Dust on the Wind"])).toBe("maybe");
  });
});

describe("spotifyStatus", () => {
  it("degrades when most fetches fail or nothing parses", () => {
    expect(spotifyStatus(10, 6, true)).toBe("degraded");
    expect(spotifyStatus(10, 1, true)).toBe("ok");
    expect(spotifyStatus(10, 0, false)).toBe("degraded");
    expect(spotifyStatus(0, 0, false)).toBe("ok");
  });
});

describe("parseCsvArtists", () => {
  it("skips the header and handles quoted commas", () => {
    expect(
      parseCsvArtists('artist,id\nAtomship,4Pb\n"Smith, Jones",32P\n'),
    ).toEqual([
      { name: "Atomship", spotifyId: "4Pb" },
      { name: "Smith, Jones", spotifyId: "32P" },
    ]);
  });
});

describe("mergeResults", () => {
  const prev: AiData = {
    version: 1,
    generatedAt: "2026-10-19T00:00:00Z",
    status: { spotify: "ok", lists: "ok", message: null },
    confirmed: { UC1: "Old AI" },
    maybeNames: ["old maybe"],
    sources: [],
  };
  it("never drops confirmed artists on a degraded run", () => {
    const m = mergeResults(prev, { confirmed: { UC2: "New" }, maybeNames: [] }, true);
    expect(m.confirmed).toEqual({ UC1: "Old AI", UC2: "New" });
    expect(m.status.spotify).toBe("degraded");
  });
  it("replaces on a healthy run and drops short maybe names", () => {
    const m = mergeResults(prev, { confirmed: { UC2: "New" }, maybeNames: ["abc", "abcd"] }, false);
    expect(m.confirmed).toEqual({ UC2: "New" });
    expect(m.maybeNames).toEqual(["abcd"]);
  });
});

describe("parseYoutubeBlocklist", () => {
  it("collects channel ids and ignores handles and comments", () => {
    const txt = [
      "[Adblock Plus 2.0]",
      "! Title: x UCnotreal",
      'youtube.com##:is(ytd-video-renderer):has(a[href*="UCIE9zgCYFKd-GLQX5jwhceA"])',
      'youtube.com##:is(ytd-video-renderer):has(a[href*="@AnatolianLab"])',
      'youtube.com##:is(ytd-video-renderer):has(a[href*="UCIE9zgCYFKd-GLQX5jwhceA"])',
    ].join("\n");
    expect(parseYoutubeBlocklist(txt)).toEqual(["UCIE9zgCYFKd-GLQX5jwhceA"]);
  });
});

describe("channelsFromSongSearch", () => {
  const row = (title: string, artists: [string, string][]) => ({
    musicResponsiveListItemRenderer: {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: {
              runs: [
                { text: "Song" },
                ...artists.map(([name, id]) => ({
                  text: name,
                  navigationEndpoint: { browseEndpoint: { browseId: id } },
                })),
                { text: "Some Album", navigationEndpoint: { browseEndpoint: { browseId: "MPREb_x" } } },
              ],
            },
          },
        },
      ],
    },
  });
  const json = {
    contents: [
      row("Dust on the Wind", [["The Velvet Sundown", "UCreal"]]),
      row("Dust On The Wind", [["The Velvet Sundown Unplugged", "UCfake"]]),
      row("Other", [["Velvet Sundown", "UCreal"], ["Guest", "UCguest"]]),
    ],
  };
  it("groups song titles by channels whose name matches exactly", () => {
    const m = channelsFromSongSearch(json, "The Velvet Sundown");
    expect([...m.keys()]).toEqual(["UCreal"]);
    expect(m.get("UCreal")).toEqual({ name: "The Velvet Sundown", titles: ["Dust on the Wind", "Other"] });
  });
});

describe("review fixes", () => {
  it("does not confirm on a generic one-word title", () => {
    expect(decideChannel(["Intro", "Home"], ["Intro"])).toBe("maybe");
    expect(decideChannel(["Dust on the Wind"], ["Dust on the Wind"])).toBe("ai");
  });

  it("only publishes confirmations for artists still on a list", () => {
    const state = {
      artists: {
        sp1: { name: "Listed", checkedAt: "", spotifyOk: true, channels: { UC1: { name: "Listed", verdict: "ai" as const } } },
        sp2: { name: "Delisted", checkedAt: "", spotifyOk: true, channels: { UC2: { name: "Delisted", verdict: "ai" as const } } },
      },
    };
    expect(confirmedFromState(state, new Set(["sp1"]), ["UCyt"])).toEqual({ UC1: "Listed", UCyt: "" });
  });

  it("keeps previous data when a list could not be downloaded", () => {
    const prev: AiData = {
      version: 1,
      generatedAt: "2026-10-19T00:00:00Z",
      status: { spotify: "ok", lists: "ok", message: null },
      confirmed: { UCyt: "" },
      maybeNames: ["old maybe"],
      sources: [],
    };
    const m = mergeResults(prev, { confirmed: { UC2: "New" }, maybeNames: ["new maybe"], status: { spotify: "ok", lists: "stale", message: null } }, false);
    expect(m.confirmed).toEqual({ UCyt: "", UC2: "New" });
    expect(m.maybeNames).toEqual(["new maybe", "old maybe"]);
    expect(m.status.lists).toBe("stale");
  });
});

describe("isDue", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  it("rechecks a Spotify miss after a day, a good check after two weeks", () => {
    expect(isDue({ checkedAt: ago(2), spotifyOk: false }, now)).toBe(true);
    expect(isDue({ checkedAt: ago(2), spotifyOk: true }, now)).toBe(false);
    expect(isDue({ checkedAt: ago(15), spotifyOk: true }, now)).toBe(true);
    expect(isDue({ checkedAt: ago(0.5), spotifyOk: false }, now)).toBe(false);
  });
});
