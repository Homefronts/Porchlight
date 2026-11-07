import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isEpisode, type QueueTrack } from "@/lib/store/playback";

export const STARTED_SEC = 30;
export const PLAYED_FRACTION = 0.95;
export const PLAYED_TAIL_SEC = 30;

export type EpisodeState = { position: number; duration?: number; played: boolean; updatedAt: number; track: QueueTrack };

type State = {
  byId: Record<string, EpisodeState>;
  record: (track: QueueTrack, position: number, duration?: number) => void;
  markPlayed: (track: QueueTrack) => void;
  markUnplayed: (videoId: string) => void;
};

export const useEpisodesStore = create<State>()(
  persist(
    (set) => ({
      byId: {},
      record: (track, position, duration) => {
        if (!isEpisode(track)) return;
        set((s) => {
          const prev = s.byId[track.videoId];
          // 0 means the player has not loaded metadata yet: unknown, not "zero length".
          const known = duration !== undefined && duration > 0 ? duration : prev?.duration;
          const done =
            known !== undefined &&
            (position >= known * PLAYED_FRACTION || (known > PLAYED_TAIL_SEC && position >= known - PLAYED_TAIL_SEC));
          const played = done || (prev?.played ?? false);
          return { byId: { ...s.byId, [track.videoId]: { position, duration: known, played, updatedAt: Date.now(), track } } };
        });
      },
      markPlayed: (track) => {
        if (!isEpisode(track)) return;
        set((s) => {
          const prev = s.byId[track.videoId];
          return { byId: { ...s.byId, [track.videoId]: { position: prev?.position ?? 0, duration: prev?.duration, played: true, updatedAt: Date.now(), track } } };
        });
      },
      markUnplayed: (videoId) =>
        set((s) => {
          const prev = s.byId[videoId];
          if (!prev) return s;
          return { byId: { ...s.byId, [videoId]: { ...prev, position: 0, played: false, updatedAt: Date.now() } } };
        }),
    }),
    { name: "ytm-episodes", version: 0 },
  ),
);

export function episodeStatus(s: EpisodeState | undefined): "new" | "started" | "played" {
  if (!s) return "new";
  if (s.played) return "played";
  return s.position >= STARTED_SEC ? "started" : "new";
}

export function minutesLeft(s: EpisodeState): number | null {
  return s.duration === undefined ? null : Math.max(1, Math.ceil((s.duration - s.position) / 60));
}

export function inProgress(byId: Record<string, EpisodeState>): EpisodeState[] {
  return Object.values(byId)
    .filter((s) => episodeStatus(s) === "started")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
