/// <reference lib="webworker" />
// Parses a Takeout export off the UI thread, so a big file never stutters audio.
import { findWatchHistory, parseHistory } from "./takeout";
import type { QuarterId } from "./quarter";

self.onmessage = async (e: MessageEvent<{ bytes: ArrayBuffer; quarter: QuarterId }>) => {
  const { bytes, quarter } = e.data;
  try {
    const found = await findWatchHistory(new Uint8Array(bytes));
    if ("error" in found) return self.postMessage(found);
    const plays = parseHistory(found.text, quarter);
    self.postMessage(Array.isArray(plays) ? { plays } : plays);
  } catch {
    self.postMessage({ error: "invalid" });
  }
};
