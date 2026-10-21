import type { QuarterId } from "./quarter";
import type { Rewind } from "./types";

/** The newest rewind, while the user hasn't opened it yet (rewinds come newest first). */
export function unseenRewind(rewinds: Rewind[], seen: QuarterId | null): Rewind | null {
  const newest = rewinds[0];
  return newest && newest.quarter !== seen ? newest : null;
}
