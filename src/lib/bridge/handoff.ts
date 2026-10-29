import { useEffect } from "react";
import { createStore, entries } from "idb-keyval";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { flushPlaybackSave } from "@/lib/store/playback";

export type HandoffFrontend = {
  localStorage: Record<string, string>;
  /** database name -> that kv store's entries */
  idb: Record<string, Record<string, unknown>>;
};

// Rebuildable caches: big, and Porchlight refetches them. The IndexedDB
// caches (ytubic-cache, ytubic-cover-cache) are left out the same way.
const SKIP_LS = new Set(["ytubic-query-cache", "ytubic-cover-cache"]);
// Every persisted kv store: app state, and Rewind history.
const IDB_DBS = ["ytubic-stores", "ytubic-rewind"];

/** Everything the frontend stores that Porchlight should import. */
export async function collectHandoff(): Promise<HandoffFrontend> {
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === null || SKIP_LS.has(k)) continue;
    const v = localStorage.getItem(k);
    if (v !== null) ls[k] = v;
  }
  const idb: HandoffFrontend["idb"] = {};
  if (typeof indexedDB !== "undefined") {
    for (const db of IDB_DBS) {
      idb[db] = Object.fromEntries(
        await entries<string, unknown>(createStore(db, "kv")),
      );
    }
  }
  return { localStorage: ls, idb };
}

/** Save the handoff, giving up after 2 s so Quit and updates never hang on it. */
export async function writeHandoffBounded(): Promise<void> {
  try {
    const timedOut = Symbol();
    const r = await Promise.race([
      collectHandoff()
        .then((h) => invoke("write_handoff", { json: JSON.stringify(h) }))
        .then(() => undefined),
      new Promise<symbol>((resolve) => setTimeout(() => resolve(timedOut), 2000)),
    ]);
    if (r === timedOut) console.warn("[handoff] gave up after 2 s");
  } catch (e) {
    console.warn("[handoff] not saved:", e);
  }
}

/**
 * Mount once. A baseline handoff shortly after launch, and the save for
 * quits that start in Rust (tray Quit, window close): Rust asks, we save,
 * then quit ourselves; Rust force-exits after 2.5 s if we never answer.
 */
export function useHandoffSchedule(): void {
  useEffect(() => {
    const t = window.setTimeout(() => void writeHandoffBounded(), 30_000);
    const un = listen("quit-requested", async () => {
      flushPlaybackSave();
      await writeHandoffBounded();
      void invoke("quit_app");
    });
    return () => {
      window.clearTimeout(t);
      void un.then((f) => f());
    };
  }, []);
}
