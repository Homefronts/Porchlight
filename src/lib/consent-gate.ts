import type { Consent } from "@/lib/store/lyrics-settings";

export function shouldShowConsent(s: {
  consent: Consent;
  pickerSeen: boolean;
  whatsNewOpen: boolean;
  makeItYoursOpen: boolean;
}): boolean {
  return s.consent === "unasked" && s.pickerSeen && !s.whatsNewOpen && !s.makeItYoursOpen;
}
