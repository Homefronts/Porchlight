import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { findWatchHistory, parseTakeout } from "./takeout";

const iso = (d: Date) => d.toISOString();
const at = (day: number, sec = 0) => new Date(2026, 1, day, 12, 0, sec);
const entry = (id: string, time: Date, extra: Record<string, unknown> = {}) => ({
  header: "YouTube Music",
  title: `Watched Song ${id}`,
  titleUrl: `https://music.youtube.com/watch?v=${id}`,
  subtitles: [{ name: "Some Artist - Topic", url: "https://www.youtube.com/channel/UCx" }],
  time: iso(time),
  products: ["YouTube"],
  ...extra,
});

describe("parseTakeout", () => {
  it("keeps this quarter's YouTube Music plays and cleans titles and artists", () => {
    const ps = parseTakeout(
      [
        entry("a", at(3)),
        entry("yt", at(4), { header: "YouTube", titleUrl: "https://www.youtube.com/watch?v=yt" }),
        entry("old", new Date(2025, 11, 30)),
      ],
      "2026-Q1",
    );
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({
      videoId: "a", title: "Song a", artists: [{ id: "UCx", name: "Some Artist" }], source: "takeout", counted: true, playedSec: 0,
    });
  });

  it("drops an entry followed by another under 30 seconds later (a skip)", () => {
    const ps = parseTakeout([entry("b", at(5, 10)), entry("a", at(5, 0))], "2026-Q1");
    expect(ps.map((p) => p.videoId)).toEqual(["b"]);
  });

  it("ignores junk", () => {
    expect(parseTakeout({ nope: true }, "2026-Q1")).toEqual([]);
    expect(parseTakeout([{ header: "YouTube Music" }], "2026-Q1")).toEqual([]);
  });
});

/** A one-file zip, deflated, as Takeout makes them. */
function zip(name: string, text: string): Uint8Array {
  const data = Buffer.from(text);
  const comp = deflateRawSync(data);
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = 30 + n.length + comp.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  return new Uint8Array(Buffer.concat([local, n, comp, central, n, end]));
}

describe("findWatchHistory", () => {
  it("reads watch-history.json out of a Takeout zip", async () => {
    const bytes = zip("Takeout/YouTube and YouTube Music/history/watch-history.json", "[1,2]");
    expect(await findWatchHistory(bytes, "takeout.zip")).toEqual({ json: "[1,2]" });
  });
  it("finds the history in a non-English export by its content", async () => {
    const json = JSON.stringify([{ titleUrl: "https://music.youtube.com/watch?v=a", time: "2026-02-01T00:00:00Z" }]);
    const bytes = zip("Takeout/YouTube und YouTube Music/Verlauf/Wiedergabeverlauf.json", json);
    expect(await findWatchHistory(bytes, "takeout-20261020.zip")).toEqual({ json });
  });
  it("takes a bare JSON file and rejects the HTML export", async () => {
    expect(await findWatchHistory(new TextEncoder().encode("[]"), "watch-history.json")).toEqual({ json: "[]" });
    expect(await findWatchHistory(new TextEncoder().encode("<html>"), "watch-history.html")).toEqual({ error: "html" });
  });
});
