import { describe, expect, it } from "vitest";
import { pickSource, type Availability } from "./pick";
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
});
