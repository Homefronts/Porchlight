import { invoke } from "@tauri-apps/api/core";
import { createStore, get, set } from "idb-keyval";
import { toast } from "sonner";
import type { HandoffFrontend } from "./handoff";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isHandoff(v: unknown): v is HandoffFrontend {
  return (
    isRecord(v) &&
    isRecord(v.localStorage) &&
    Object.values(v.localStorage).every((x) => typeof x === "string") &&
    isRecord(v.idb) &&
    Object.values(v.idb).every(isRecord)
  );
}

/**
 * Copies the old app's in-app state into this app's storage before any store
 * loads. Only fills keys that are absent, so it is safe to repeat and never
 * overwrites Porchlight data. Acks (deletes the handoff) only on success; an
 * invalid file is left in place for diagnosis.
 */
export async function importHandoff(): Promise<"imported" | "none" | "invalid"> {
  const data = await invoke<unknown>("take_handoff_frontend");
  if (data == null) return "none";
  if (!isHandoff(data)) return "invalid";
  for (const [k, v] of Object.entries(data.localStorage)) {
    if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }
  for (const [db, entries] of Object.entries(data.idb)) {
    const store = createStore(db, "kv");
    for (const [k, v] of Object.entries(entries)) {
      if ((await get(k, store)) === undefined) await set(k, v, store);
    }
  }
  await invoke("ack_handoff_imported");
  return "imported";
}

type MoveStatus = { state: string; notice: "moved" | "failed" | null };

const FAILED = "Couldn't finish moving your YTubic Plus data. Your old app is still installed.";

async function retry(): Promise<void> {
  const id = toast.loading("Moving your YTubic Plus data…");
  try {
    const out = await invoke<MoveStatus>("retry_move");
    if (out.state !== "done") throw new Error("not done");
    await importHandoff();
    // Stores already hydrated at launch; reload so they pick up the imported data.
    window.location.reload();
  } catch {
    toast.dismiss(id);
    showFailed();
  }
}

function showFailed(): void {
  toast.error(FAILED, {
    duration: Infinity,
    action: { label: "Try again", onClick: () => void retry() },
  });
}

/** One-line notice about the move, as a toast. */
export async function showMoveNotice(): Promise<void> {
  const { notice } = await invoke<MoveStatus>("move_status");
  if (notice === "moved") toast("Moved over from YTubic Plus.");
  else if (notice === "failed") showFailed();
}
