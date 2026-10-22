import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { emit } from "@tauri-apps/api/event";
import { isFloatingPlayerWindow } from "@/lib/floating-player";
import { dropLegacyLocalStorageKey, safeIdbStorage } from "./idb-storage";

export type SourceKind = "song" | "video";

export type TrackSources = {
  /** Audio-version id. Always set — set to whichever id we first saw. */
  song: string;
  /** Music-video version id. Resolved on first toggle to video. */
  video?: string;
  /** Currently active source for this track. */
  selected: SourceKind;
};

type State = {
  /**
   * Keyed by EVERY known id for a track — both `song` and `video`
   * entries point to the same record. This lets a toggle from either
   * the song side or the video side land on the same object so the
   * pair stays consistent.
   */
  byVideoId: Record<string, TrackSources>;
  /** Cache an alternate id we resolved. `kind` is the kind of `altId`. */
  setAlternate: (knownId: string, kind: SourceKind, altId: string) => void;
  /** Flip the active source for a track. */
  setSelected: (anyVideoId: string, selected: SourceKind) => void;
  /**
   * The Song/Video chip as a mode, like YouTube Music's: on, every track plays
   * its music video when it has one (see `useVideoModeFollower`).
   */
  videoMode: boolean;
  setVideoMode: (on: boolean) => void;
};

// Soft cap on `byVideoId`. Each unique track contributes two keys (song
// and video aliases), so 2000 keys ≈ 1000 tracks. It lives in IndexedDB,
// outside WebKitGTK's tight localStorage quota, but is still bounded.
const MAX_BY_VIDEO_ID_KEYS = 2000;
const KEEP_ON_TRIM = 1500;

function capByVideoId(
  map: Record<string, TrackSources>,
): Record<string, TrackSources> {
  const keys = Object.keys(map);
  if (keys.length <= MAX_BY_VIDEO_ID_KEYS) return map;
  // JS object iteration preserves insertion order. Drop the oldest
  // entries — may temporarily orphan half a song/video pair, which the
  // next user toggle re-resolves via `findAlternateVideoId`.
  const out: Record<string, TrackSources> = {};
  const start = keys.length - KEEP_ON_TRIM;
  for (let i = start; i < keys.length; i++) out[keys[i]] = map[keys[i]];
  return out;
}

/**
 * Saved state from an older version. v0 paired songs with the first search
 * result (sometimes a lyric video, cover or live take), so its pairs are
 * dropped once and rebuilt by the strict lookup as songs play.
 */
export function migrateTrackSources(persisted: unknown, version: number): Pick<State, "byVideoId" | "videoMode"> {
  if (version < 1) return { byVideoId: {}, videoMode: false };
  return persisted as Pick<State, "byVideoId" | "videoMode">;
}

export const useTrackSourceStore = create<State>()(
  persist(
    (set) => ({
      byVideoId: {},
      videoMode: false,
      setVideoMode: (videoMode) => set({ videoMode }),
      setAlternate: (knownId, kind, altId) =>
        set((s) => {
          const existing = s.byVideoId[knownId];
          // If we already have a record, just fill in the missing side.
          // Otherwise build a fresh pair with the right orientation —
          // `selected` defaults to whichever side `knownId` is, so the
          // caller's current view stays active until they explicitly toggle.
          const updated: TrackSources = existing
            ? { ...existing, [kind]: altId }
            : kind === "video"
              ? { song: knownId, video: altId, selected: "song" }
              : { song: altId, video: knownId, selected: "video" };
          // Alias both ids at the same object so `byVideoId[song]` and
          // `byVideoId[video]` always agree.
          const next = { ...s.byVideoId, [knownId]: updated, [altId]: updated };
          if (existing?.song) next[existing.song] = updated;
          if (existing?.video) next[existing.video] = updated;
          return { byVideoId: capByVideoId(next) };
        }),
      setSelected: (id, selected) =>
        set((s) => {
          const existing = s.byVideoId[id];
          if (!existing) {
            // No record yet — synthesize a stub so the choice is sticky
            // even before we've resolved the alternate.
            const fresh: TrackSources = { song: id, selected };
            return { byVideoId: capByVideoId({ ...s.byVideoId, [id]: fresh }) };
          }
          const updated = { ...existing, selected };
          const next = { ...s.byVideoId, [existing.song]: updated };
          if (existing.video) next[existing.video] = updated;
          return { byVideoId: next };
        }),
    }),
    {
      name: "ytm-track-source",
      storage: createJSONStorage(() => safeIdbStorage),
      version: 1,
      migrate: migrateTrackSources,
    },
  ),
);

dropLegacyLocalStorageKey("ytm-track-source");

/**
 * In the floating player window, redirect mutations to the main window
 * so its audio engine sees the updated source preference and re-runs
 * the stream resolver. Same reasoning as the playback-store remote
 * control above; the main side echoes the resulting `byVideoId` back
 * via `track-source:state`.
 *
 * Call this from the floating window's entrypoint module before any
 * component reads from the store. Guarded so a bundle-level call from
 * the main window (which statically imports the floating module) is a
 * no-op rather than silently breaking the main window's Source toggle.
 */
export function initFloatingTrackSourceBridge(): void {
  if (!isFloatingPlayerWindow()) return;
  useTrackSourceStore.setState({
    setAlternate: (knownId, kind, altId) => {
      void emit("track-source:action", {
        type: "setAlternate",
        knownId,
        kind,
        altId,
      });
    },
    setSelected: (id, selected) => {
      void emit("track-source:action", {
        type: "setSelected",
        id,
        selected,
      });
    },
    setVideoMode: (on) => {
      void emit("track-source:action", { type: "setVideoMode", on });
    },
  });
}

/**
 * Resolve the videoId we should actually stream given the displayed
 * (queue) id. Snapshot helper — for reactive subscriptions, read from
 * the store directly.
 */
type StreamSlot = { videoId?: string; index: number; streamVideoId?: string };

/**
 * Where a newly loaded stream should start: the old playhead when the same
 * queue slot only switched between its song and video versions, else null
 * (from the top). Under a second counts as not started yet.
 */
export function resumeOnSourceSwitch(last: StreamSlot | null, now: StreamSlot, currentTime: number): number | null {
  const switched = !!last && last.videoId === now.videoId && last.index === now.index && last.streamVideoId !== now.streamVideoId;
  return switched && currentTime >= 1 ? currentTime : null;
}

export function resolveStreamId(
  displayedId: string,
  byVideoId: Record<string, TrackSources>,
): string {
  const rec = byVideoId[displayedId];
  if (!rec) return displayedId;
  if (rec.selected === "video" && rec.video) return rec.video;
  return rec.song;
}
