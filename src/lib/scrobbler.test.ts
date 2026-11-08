import { describe, expect, it } from "vitest";
import { loveTargets, scrobbleTargets } from "./scrobbler";

const off = {
  lastfmEnabled: false,
  lastfmSessionKey: null,
  lastfmLoveSync: false,
  librefmEnabled: false,
  librefmSessionKey: null,
  librefmLoveSync: false,
  listenbrainzEnabled: false,
  listenbrainzToken: null,
};

describe("scrobbleTargets", () => {
  it("is empty with nothing connected", () => {
    expect(scrobbleTargets(off)).toEqual([]);
  });

  it("sends to every service that is both connected and switched on", () => {
    const t = scrobbleTargets({
      ...off,
      lastfmEnabled: true,
      lastfmSessionKey: "a",
      librefmEnabled: true,
      librefmSessionKey: "b",
      listenbrainzEnabled: true,
      listenbrainzToken: "c",
    });
    expect(t.map((x) => x.id)).toEqual(["lastfm", "librefm", "listenbrainz"]);
    expect(t[0]).toMatchObject({
      nowPlaying: "lastfm_update_now_playing",
      scrobble: "lastfm_scrobble",
      auth: { service: "lastfm", sessionKey: "a" },
    });
    expect(t[1].auth).toEqual({ service: "librefm", sessionKey: "b" });
    expect(t[2]).toMatchObject({
      nowPlaying: "listenbrainz_now_playing",
      scrobble: "listenbrainz_scrobble",
      auth: { token: "c" },
    });
  });

  it("skips a service that is off, or on without an account", () => {
    const t = scrobbleTargets({
      ...off,
      lastfmEnabled: true, // no session
      librefmSessionKey: "b", // switched off
      listenbrainzEnabled: true,
      listenbrainzToken: "c",
    });
    expect(t.map((x) => x.id)).toEqual(["listenbrainz"]);
  });
});

describe("loveTargets", () => {
  it("loves on Last.fm and Libre.fm only where sync is on", () => {
    expect(
      loveTargets({
        ...off,
        lastfmSessionKey: "a",
        lastfmLoveSync: true,
        librefmSessionKey: "b",
        librefmLoveSync: false,
      }),
    ).toEqual([{ service: "lastfm", sessionKey: "a" }]);
    expect(
      loveTargets({ ...off, librefmSessionKey: "b", librefmLoveSync: true }),
    ).toEqual([{ service: "librefm", sessionKey: "b" }]);
  });
});
