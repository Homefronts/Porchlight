import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { findWatchHistory, parseHistory, parseTakeout } from "./takeout";

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

/** One entry laid out as in Takeout's default HTML export (October 2026). */
const cell = (header: string, body: string) =>
  `<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid"><div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">${header}<br></p></div><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">${body}<br></div><div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption"><b>Products:</b><br>&emsp;YouTube<br></div></div></div>`;
const song = (id: string, title: string, date: string) =>
  cell(
    "YouTube Music",
    `Watched <a href="https://music.youtube.com/watch?v=${id}">${title}</a><br><a href="https://www.youtube.com/channel/UCx">Tom &amp; Jerry - Topic</a><br>${date}`,
  );

describe("parseHistory", () => {
  it("reads Takeout's HTML export", () => {
    const html = `<html><body><div class="mdl-grid">${[
      song("b", "Rock &amp; Roll", "Feb 5, 2026, 3:10:00\u202fPM EST"),
      song("a", "Don&#39;t Stop", "Feb 5, 2026, 3:00:00\u202fPM EST"),
      cell("YouTube", `Watched <a href="https://www.youtube.com/watch?v=v">A video</a><br><a href="https://www.youtube.com/channel/UCv">Vlogger</a><br>Feb 5, 2026, 2:00:00\u202fPM EST`),
      cell("YouTube Music", "Watched a video that has been removed<br>Feb 5, 2026, 1:00:00\u202fPM EST"),
      song("old", "Last Year", "Dec 30, 2025, 1:00:00\u202fPM EST"),
    ].join("")}</div></body></html>`;
    const ps = parseHistory(html, "2026-Q1");
    expect(ps).toEqual([
      expect.objectContaining({ videoId: "a", title: "Don't Stop", startedAt: Date.parse("2026-02-05T20:00:00Z"), artists: [{ id: "UCx", name: "Tom & Jerry" }] }),
      expect.objectContaining({ videoId: "b", title: "Rock & Roll" }),
    ]);
  });

  it("reads a date in a zone the parser doesn't know as local time", () => {
    const ps = parseHistory(song("a", "Song", "5 Feb 2026, 15:00:00 CET"), "2026-Q1");
    expect(ps).toEqual([expect.objectContaining({ startedAt: new Date(2026, 1, 5, 15).getTime() })]);
  });

  it("says so when an HTML export's dates can't be read", () => {
    expect(parseHistory(song("a", "Song", "5 февр. 2026 г., 15:00:00 MSK"), "2026-Q1")).toEqual({ error: "html" });
  });

  it("still reads JSON", () => {
    expect(parseHistory(JSON.stringify([entry("a", at(3))]), "2026-Q1")).toEqual([expect.objectContaining({ videoId: "a" })]);
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
    expect(await findWatchHistory(bytes)).toEqual({ text: "[1,2]" });
  });
  it("reads watch-history.html out of a Takeout zip", async () => {
    const bytes = zip("Takeout/YouTube and YouTube Music/history/watch-history.html", "<html>");
    expect(await findWatchHistory(bytes)).toEqual({ text: "<html>" });
  });
  it("finds the history in a non-English export by its content", async () => {
    const json = JSON.stringify([{ titleUrl: "https://music.youtube.com/watch?v=a", time: "2026-02-01T00:00:00Z" }]);
    const bytes = zip("Takeout/YouTube und YouTube Music/Verlauf/Wiedergabeverlauf.json", json);
    expect(await findWatchHistory(bytes)).toEqual({ text: json });
  });
  it("takes a bare file", async () => {
    expect(await findWatchHistory(new TextEncoder().encode("[]"))).toEqual({ text: "[]" });
  });
});
