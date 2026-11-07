import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }));

import { fetchSponsorSegments, segmentToSkip, syncSponsorCache, useSponsorCache } from "./sponsorblock";

const seg = (start: number, end: number, uuid = `u${start}`) => ({ start, end, uuid });

describe("segmentToSkip", () => {
  it("finds the segment we're inside", () => {
    const s = [seg(10, 40), seg(100, 130)];
    expect(segmentToSkip(105, s, new Set())).toEqual(s[1]);
    expect(segmentToSkip(50, s, new Set())).toBeNull();
  });
  it("ignores undone segments", () => {
    const s = [seg(10, 40)];
    expect(segmentToSkip(20, s, new Set(["u10"]))).toBeNull();
  });
  it("does not skip within 0.5 s of the end", () => {
    expect(segmentToSkip(39.7, [seg(10, 40)], new Set())).toBeNull();
  });
});

describe("fetchSponsorSegments", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("fetch failure skips nothing", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await fetchSponsorSegments("fail1")).toEqual([]);
    expect(await fetchSponsorSegments("fail1")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("only the matching video is used", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { videoID: "other", segments: [{ segment: [1, 2], UUID: "x" }] },
        { videoID: "vid1", segments: [{ segment: [5, 25], UUID: "a" }] },
      ],
    });
    expect(await fetchSponsorSegments("vid1")).toEqual([{ start: 5, end: 25, uuid: "a" }]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/skipSegments\/[0-9a-f]{4}\?categories=/);
  });

  it("a 404 gives []", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await fetchSponsorSegments("nf1")).toEqual([]);
  });
});

describe("persisted sponsor cache", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    useSponsorCache.setState({ byId: {} });
  });

  it("uses the persisted map without fetching", async () => {
    useSponsorCache.setState({ byId: { off1: [seg(1, 9)] } });
    expect(await fetchSponsorSegments("off1")).toEqual([seg(1, 9)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("syncSponsorCache saves new ids and drops removed ones", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ videoID: "new1", segments: [{ segment: [5, 25], UUID: "a" }] }],
    });
    useSponsorCache.setState({ byId: { gone: [seg(1, 2)] } });
    await syncSponsorCache(["new1"]);
    expect(useSponsorCache.getState().byId).toEqual({ new1: [{ start: 5, end: 25, uuid: "a" }] });
  });

  it("an ok answer with no segments is kept, so it isn't asked again", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await syncSponsorCache(["clean1"]);
    expect(useSponsorCache.getState().byId).toEqual({ clean1: [] });
    await syncSponsorCache(["clean1", "clean2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a failure is not kept, and an unchanged set doesn't fetch again", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await syncSponsorCache(["off2"]);
    await syncSponsorCache(["off2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSponsorCache.getState().byId).toEqual({});
  });

  it("overlapping syncs run one at a time", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ videoID: "lap1", segments: [{ segment: [5, 25], UUID: "a" }] }] });
    await Promise.all([syncSponsorCache(["lap1"]), syncSponsorCache([])]);
    // The later sync (nothing downloaded) wins, whatever order the fetches land in.
    expect(useSponsorCache.getState().byId).toEqual({});
  });
});
