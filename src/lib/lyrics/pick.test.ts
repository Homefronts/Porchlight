import { describe, expect, it } from "vitest";
import { availabilityOf, pickSource, type Availability } from "./pick";
import type { LyricsSource } from "@/lib/store/lyrics-settings";

const av = (o: Partial<Record<LyricsSource, Availability>>) =>
  ({
    file: "none", kugou: "none", netease: "none", ytmusic: "none",
    lrclib: "none", musixmatch: "none", genius: "none", ...o,
  }) as Record<LyricsSource, Availability>;

describe("pickSource", () => {
  it("first word-timed source in order wins over an earlier line source", () => {
    expect(pickSource(["ytmusic", "kugou"], av({ ytmusic: "line", kugou: "word" }))).toBe("kugou");
  });
  it("no word timing anywhere: first line source", () => {
    expect(pickSource(["genius", "lrclib", "ytmusic"], av({ genius: "plain", lrclib: "line", ytmusic: "line" }))).toBe("lrclib");
  });
  it("plain only: first plain", () => {
    expect(pickSource(["lrclib", "genius"], av({ lrclib: "plain", genius: "plain" }))).toBe("lrclib");
  });
  it("a song pick wins if it has anything", () => {
    expect(pickSource(["kugou", "genius"], av({ kugou: "word", genius: "plain" }), "genius")).toBe("genius");
  });
  it("a song pick with none falls back to auto", () => {
    expect(pickSource(["kugou", "genius"], av({ kugou: "word" }), "genius")).toBe("kugou");
  });
  it("a source still loading is skipped", () => {
    expect(pickSource(["file", "lrclib"], av({ file: "loading", lrclib: "line" }))).toBe("lrclib");
  });
  it("nothing gives null", () => {
    expect(pickSource(["file"], av({}))).toBeNull();
  });
  it("a song pick outside the enabled order is ignored", () => {
    expect(pickSource(["lrclib"], av({ lrclib: "line", kugou: "word" }), "kugou")).toBe("lrclib");
  });
  it("a disabled source's cached data is not used", () => {
    const data = { kind: "plain", text: "la" } as const;
    expect(availabilityOf(data, false, false, false)).toBe("none");
    expect(availabilityOf(data, false, false)).toBe("plain");
  });
});
