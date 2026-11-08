import { describe, expect, it } from "vitest";
import { shouldShowConsent } from "./consent-gate";

const clear = { consent: "unasked", pickerSeen: true, whatsNewOpen: false, makeItYoursOpen: false } as const;

describe("shouldShowConsent", () => {
  it("shows when unasked and nothing else is open", () => {
    expect(shouldShowConsent(clear)).toBe(true);
  });
  it("hides once answered", () => {
    expect(shouldShowConsent({ ...clear, consent: "accepted" })).toBe(false);
    expect(shouldShowConsent({ ...clear, consent: "declined" })).toBe(false);
  });
  it("waits for What's New", () => {
    expect(shouldShowConsent({ ...clear, whatsNewOpen: true })).toBe(false);
  });
  it("waits for the first-launch picker", () => {
    expect(shouldShowConsent({ ...clear, pickerSeen: false, makeItYoursOpen: true })).toBe(false);
    expect(shouldShowConsent({ ...clear, pickerSeen: false })).toBe(false);
  });
});
