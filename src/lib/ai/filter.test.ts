import { describe, expect, it, vi } from "vitest";
import { filterAiItems, refillFiltered } from "./filter";
import type { AiIndex } from "./match";

const idx: AiIndex = {
  confirmed: new Set(["UCai"]),
  confirmedNames: new Set(["robot"]),
  maybe: new Set(["namesake"]),
};

const song = (id: string, artistId?: string, name = "Someone") => ({
  kind: "song",
  id,
  artists: [{ id: artistId, name }],
});

describe("filterAiItems", () => {
  const items = [
    song("1", "UCai", "Robot"),
    song("2", "UCreal"),
    song("3", undefined, "Namesake"),
    song("4", undefined, "Robot"),
    { kind: "artist", id: "UCai", title: "Robot" },
    { kind: "artist", id: "UCreal", title: "Real" },
  ];
  it("hides confirmed songs and artist cards, keeps maybes and id-less rows", () => {
    expect(filterAiItems(items, idx, {}, true).map((i) => i.id)).toEqual(["2", "3", "4", "UCreal"]);
  });
  it("keeps everything while AI music is on", () => {
    expect(filterAiItems(items, idx, {}, false)).toBe(items);
  });
  it("respects Not AI overrides", () => {
    expect(filterAiItems(items, idx, { UCai: "not-ai" }, true)).toHaveLength(6);
  });
});

describe("refillFiltered", () => {
  const ai = (n: number) => Array.from({ length: n }, (_, i) => song(`a${i}`, "UCai"));
  const keep = (i: { artists?: { id?: string }[] }) => i.artists?.[0]?.id !== "UCai";

  it("stops refilling after 3 continuations", async () => {
    const fetchMore = vi.fn(async () => ({ tracks: ai(5), continuation: "next" }));
    const r = await refillFiltered(ai(5), "t0", fetchMore, keep);
    expect(fetchMore).toHaveBeenCalledTimes(3);
    expect(r.tracks).toEqual([]);
    expect(r.continuation).toBe("next");
  });
  it("does not fetch when enough songs survive", async () => {
    const fetchMore = vi.fn();
    const many = Array.from({ length: 12 }, (_, i) => song(`k${i}`, "UCreal"));
    const r = await refillFiltered(many, "t0", fetchMore, keep);
    expect(fetchMore).not.toHaveBeenCalled();
    expect(r.tracks).toHaveLength(12);
  });
  it("stops when the source runs out", async () => {
    const fetchMore = vi.fn(async () => ({ tracks: [song("x", "UCreal")] }));
    const r = await refillFiltered(ai(3), "t0", fetchMore, keep);
    expect(fetchMore).toHaveBeenCalledTimes(1);
    expect(r.tracks.map((t) => t.id)).toEqual(["x"]);
    expect(r.continuation).toBeUndefined();
  });
});
