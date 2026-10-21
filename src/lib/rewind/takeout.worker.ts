/// <reference lib="webworker" />
// Parses a Takeout export off the UI thread, so a big file never stutters audio.
import { findWatchHistory, parseTakeout } from "./takeout";
import type { QuarterId } from "./quarter";

self.onmessage = async (e: MessageEvent<{ bytes: ArrayBuffer; name: string; quarter: QuarterId }>) => {
  const { bytes, name, quarter } = e.data;
  try {
    const found = await findWatchHistory(new Uint8Array(bytes), name);
    if ("error" in found) return self.postMessage(found);
    self.postMessage({ plays: parseTakeout(JSON.parse(found.json), quarter) });
  } catch {
    self.postMessage({ error: "invalid" });
  }
};
