import { useEffect, useMemo } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeIdbStorage } from "@/lib/store/idb-storage";
import { indexAiData, type AiData, type AiIndex } from "./match";
import snapshot from "./snapshot.json";

/**
 * The AI artist data the daily job publishes to the `ai-data` branch
 * (`scripts/ai-data/run.ts`). Fetched at launch and daily, kept in
 * IndexedDB so it works offline, with a bundled snapshot for the first
 * launch. Classification is purely in-memory: no request per song.
 */
export const AI_DATA_URL =
  "https://raw.githubusercontent.com/Homefronts/YTubic-/ai-data/ai-artists.json";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const SPOTIFY_COPY =
  "AI detection is running in reduced mode. Spotify changed something on their side that we use to confirm AI artists, so new matches show as \"AI?\" for now. This is outside our control, but we're working on a fix and it'll come back with an update.";
const LISTS_COPY =
  "AI detection is running in reduced mode. A community list we rely on stopped updating, so new matches show as \"AI?\" for now. This is outside our control, but we're working on a fix and it'll come back with an update.";

export function parseAiData(json: unknown): AiData | null {
  const d = json as AiData;
  if (!d || typeof d !== "object" || d.version !== 1) return null;
  if (typeof d.generatedAt !== "string" || !d.status) return null;
  if (!d.confirmed || typeof d.confirmed !== "object" || Array.isArray(d.confirmed)) return null;
  if (!Array.isArray(d.maybeNames) || !Array.isArray(d.sources)) return null;
  return d;
}

export type AiDetectionMode =
  | { reduced: false }
  | { reduced: true; reason: "spotify" | "lists" | "stale"; message: string };

export function aiDetectionMode(d: AiData, now: number): AiDetectionMode {
  const reason =
    d.status.spotify === "degraded"
      ? "spotify"
      : d.status.lists === "stale"
        ? "lists"
        : now - Date.parse(d.generatedAt) > STALE_MS
          ? "stale"
          : null;
  if (!reason) return { reduced: false };
  const message = d.status.message ?? (reason === "spotify" ? SPOTIFY_COPY : LISTS_COPY);
  return { reduced: true, reason, message };
}

type State = {
  data: AiData | null;
  fetchedAt: number;
  /** Reduced-mode reason already announced, so the toast shows once. */
  noticeReason: string | null;
  setData: (data: AiData, at: number) => void;
  setNoticeReason: (r: string | null) => void;
};

export const useAiDataStore = create<State>()(
  persist(
    (set) => ({
      data: null,
      fetchedAt: 0,
      noticeReason: null,
      setData: (data, fetchedAt) => set({ data, fetchedAt }),
      setNoticeReason: (noticeReason) => set({ noticeReason }),
    }),
    { name: "ytubic-ai-data", storage: createJSONStorage(() => safeIdbStorage) },
  ),
);

const bundled = parseAiData(snapshot)!;

export function currentAiData(): AiData {
  return useAiDataStore.getState().data ?? bundled;
}

let cachedFor: AiData | null = null;
let cachedIndex: AiIndex | null = null;

/** Non-hook index, memoised on the data object (used by playback). */
export function currentAiIndex(): AiIndex {
  const d = currentAiData();
  if (d !== cachedFor || !cachedIndex) {
    cachedFor = d;
    cachedIndex = indexAiData(d);
  }
  return cachedIndex;
}

export function useAiIndex(): AiIndex {
  const data = useAiDataStore((s) => s.data);
  return useMemo(() => {
    void data;
    return currentAiIndex();
  }, [data]);
}

async function syncAiData(): Promise<void> {
  try {
    const res = await tauriFetch(AI_DATA_URL, { cache: "no-store" });
    if (!res.ok) return;
    const d = parseAiData(await res.json());
    if (d) useAiDataStore.getState().setData(d, Date.now());
  } catch {
    // Offline or GitHub unreachable: keep the last good data.
  }
}

export function useAiDataSync(): void {
  useEffect(() => {
    void syncAiData();
    const timer = window.setInterval(() => void syncAiData(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
}
