import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_DATA_URL, aiDetectionMode, parseAiData, reducedNoticeAction } from "./data";
import snapshot from "./snapshot.json";
import type { AiData } from "./match";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");

function data(over: Partial<AiData> = {}): AiData {
  return {
    version: 1,
    generatedAt: "2026-10-20T05:00:00Z",
    status: { spotify: "ok", lists: "ok", message: null },
    confirmed: {},
    maybeNames: [],
    sources: [],
    ...over,
  };
}

describe("parseAiData", () => {
  it("rejects malformed or future-version data", () => {
    expect(parseAiData({ ...data(), version: 2 })).toBeNull();
    expect(parseAiData("nope")).toBeNull();
    expect(parseAiData({ version: 1 })).toBeNull();
    expect(parseAiData({ ...data(), confirmed: [] })).toBeNull();
  });
  it("accepts the bundled snapshot", () => {
    expect(parseAiData(snapshot)).not.toBeNull();
  });
});

describe("aiDetectionMode", () => {
  it("is normal when everything is healthy and fresh", () => {
    expect(aiDetectionMode(data(), NOW)).toEqual({ reduced: false });
  });
  it("explains a Spotify outage with the agreed copy", () => {
    const m = aiDetectionMode(data({ status: { spotify: "degraded", lists: "ok", message: null } }), NOW);
    expect(m).toMatchObject({ reduced: true, reason: "spotify" });
    expect(m.reduced && m.message).toContain("Spotify changed something on their side");
    expect(m.reduced && m.message).toContain("we're working on a fix");
  });
  it("explains stale community lists", () => {
    const m = aiDetectionMode(data({ status: { spotify: "ok", lists: "stale", message: null } }), NOW);
    expect(m).toMatchObject({ reduced: true, reason: "lists" });
    expect(m.reduced && m.message).toMatch(/a community list we rely on stopped updating/i);
  });
  it("treats data older than 7 days as stale", () => {
    const old = new Date(NOW - 8 * DAY).toISOString();
    expect(aiDetectionMode(data({ generatedAt: old }), NOW)).toMatchObject({ reduced: true, reason: "stale" });
  });
  it("lets the job override the copy", () => {
    const m = aiDetectionMode(data({ status: { spotify: "degraded", lists: "ok", message: "Custom." } }), NOW);
    expect(m.reduced && m.message).toBe("Custom.");
  });
});

describe("AI data host", () => {
  it("is allowed by the Tauri HTTP capability", () => {
    const caps = readFileSync(join(process.cwd(), "src-tauri/capabilities/default.json"), "utf8");
    expect(caps).toContain(`"${new URL(AI_DATA_URL).origin}/*"`);
  });
});

describe("reducedNoticeAction", () => {
  const base = { reason: "stale" as const, noticeReason: null, ready: true, aiMusic: false };
  it("waits until saved data loaded and the first sync ran", () => {
    expect(reducedNoticeAction({ ...base, ready: false })).toBeNull();
  });
  it("stays quiet for people not using the filter", () => {
    expect(reducedNoticeAction({ ...base, aiMusic: true })).toBeNull();
  });
  it("announces a new reason once", () => {
    expect(reducedNoticeAction(base)).toBe("announce");
    expect(reducedNoticeAction({ ...base, noticeReason: "stale" })).toBeNull();
  });
  it("clears once healthy again", () => {
    expect(reducedNoticeAction({ ...base, reason: null, noticeReason: "stale" })).toBe("clear");
  });
});

describe("parseAiData validation", () => {
  it("rejects non-string names", () => {
    expect(parseAiData({ ...data(), confirmed: { UC1: 5 } })).toBeNull();
    expect(parseAiData({ ...data(), maybeNames: [1] })).toBeNull();
  });
});
