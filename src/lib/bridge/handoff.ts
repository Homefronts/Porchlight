import { entries } from "idb-keyval";
import { invoke } from "@tauri-apps/api/core";
import { idbStore } from "@/lib/store/idb-storage";

export type HandoffFrontend = {
  localStorage: Record<string, string>;
  idb: Record<string, unknown>;
};

// Rebuildable caches: big, and Porchlight refetches them.
const SKIP_LS = new Set(["ytubic-query-cache", "ytubic-cover-cache"]);

/** Everything the frontend stores that Porchlight should import. */
export async function collectHandoff(): Promise<HandoffFrontend> {
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === null || SKIP_LS.has(k)) continue;
    const v = localStorage.getItem(k);
    if (v !== null) ls[k] = v;
  }
  const idb = idbStore
    ? Object.fromEntries(await entries<string, unknown>(idbStore))
    : {};
  return { localStorage: ls, idb };
}

/** Save the handoff, giving up after 2 s so Quit and updates never hang on it. */
export async function writeHandoffBounded(): Promise<void> {
  try {
    await Promise.race([
      collectHandoff().then((h) =>
        invoke("write_handoff", { json: JSON.stringify(h) }),
      ),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (e) {
    console.warn("[handoff] not saved:", e);
  }
}
