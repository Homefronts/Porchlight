import { describe, expect, it } from "vitest";
import {
  classifyArtists,
  indexAiData,
  normalizeName,
  normalizeTitle,
  type AiData,
} from "./match";

function data(confirmed: Record<string, string>, maybeNames: string[] = []): AiData {
  return {
    version: 1,
    generatedAt: "2026-10-20T00:00:00Z",
    status: { spotify: "ok", lists: "ok", message: null },
    confirmed,
    maybeNames,
    sources: [],
  };
}

describe("normalizeName", () => {
  it("lower-cases and drops a leading 'the'", () => {
    expect(normalizeName("The Velvet Sundown")).toBe("velvet sundown");
  });
  it("strips diacritics and punctuation", () => {
    expect(normalizeName("Beyoncé!")).toBe("beyonce");
    expect(normalizeName("  AC/DC  ")).toBe("ac dc");
  });
});

describe("normalizeTitle", () => {
  it("drops bracketed suffixes and feat. tails", () => {
    expect(normalizeTitle("Dust on the Wind (Official Video)")).toBe("dust on the wind");
    expect(normalizeTitle("Song [Remastered] feat. Someone")).toBe("song");
  });
});

describe("classifyArtists", () => {
  const idx = indexAiData(data({ UC1: "Velvet Sundown" }, ["neural groove machine"]));

  it("confirms by channel id", () => {
    expect(classifyArtists([{ id: "UC1", name: "X" }], idx, {})).toBe("ai");
  });
  it("counts any credited artist", () => {
    expect(
      classifyArtists([{ id: "UC9", name: "Real" }, { id: "UC1", name: "X" }], idx, {}),
    ).toBe("ai");
  });
  it("is only maybe on a name match", () => {
    expect(classifyArtists([{ id: "UC2", name: "Neural Groove Machine" }], idx, {})).toBe("maybe");
    expect(classifyArtists([{ name: "Neural Groove Machine" }], idx, {})).toBe("maybe");
  });
  it("never confirms without a channel id", () => {
    expect(classifyArtists([{ name: "Velvet Sundown" }], idx, {})).toBe("maybe");
  });
  it("lets user overrides win", () => {
    expect(classifyArtists([{ id: "UC1", name: "X" }], idx, { UC1: "not-ai" })).toBeNull();
    expect(classifyArtists([{ id: "UC7", name: "Y" }], idx, { UC7: "ai" })).toBe("ai");
  });
  it("is null for no artists", () => {
    expect(classifyArtists(undefined, idx, {})).toBeNull();
    expect(classifyArtists([], idx, {})).toBeNull();
  });
});
