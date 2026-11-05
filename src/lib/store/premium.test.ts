import { describe, expect, it } from "vitest";
import { OFFLINE_GRANT_MS, downloadedPlaybackAllowed, freeStreamAllowed } from "@/lib/store/premium";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;

describe("downloadedPlaybackAllowed", () => {
  it("is a 30-day window", () => {
    expect(OFFLINE_GRANT_MS).toBe(30 * DAY);
  });

  it("allows while Premium is confirmed right now", () => {
    expect(
      downloadedPlaybackAllowed(now, { status: "premium", premiumConfirmedAt: null, premiumLapsed: false }),
    ).toBe(true);
  });

  it("allows offline within 30 days of the last confirmation", () => {
    expect(
      downloadedPlaybackAllowed(now, { status: null, premiumConfirmedAt: now - 29 * DAY, premiumLapsed: false }),
    ).toBe(true);
  });

  it("blocks after 30 days without a check", () => {
    expect(
      downloadedPlaybackAllowed(now, { status: null, premiumConfirmedAt: now - 31 * DAY, premiumLapsed: false }),
    ).toBe(false);
  });

  it("blocks when the last check said the account lost Premium", () => {
    expect(
      downloadedPlaybackAllowed(now, { status: null, premiumConfirmedAt: now - DAY, premiumLapsed: true }),
    ).toBe(false);
  });

  it("blocks when Premium was never confirmed", () => {
    expect(
      downloadedPlaybackAllowed(now, { status: null, premiumConfirmedAt: null, premiumLapsed: false }),
    ).toBe(false);
  });
});

describe("freeStreamAllowed", () => {
  it("needs a confirmed Free account that opted in", () => {
    expect(freeStreamAllowed("free", true, false)).toBe(true);
    expect(freeStreamAllowed("free", false, false)).toBe(false);
    expect(freeStreamAllowed(null, true, false)).toBe(false);
  });

  it("never unlocks a downloaded track past its offline grant", () => {
    expect(freeStreamAllowed("free", true, true)).toBe(false);
  });
});
