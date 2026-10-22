import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useFullscreenStore } from "@/lib/store/fullscreen";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { usePlaybackSettings } from "@/lib/store/playback-settings";
import { usePlaybackAllowed } from "@/lib/store/premium";
import { useTrackSourceStore } from "@/lib/store/track-source";
import { cn } from "@/lib/utils";

/** Re-sync the picture when it drifts this far from the audio. */
const MAX_DRIFT_SEC = 0.4;

type Picture = Pick<HTMLVideoElement, "readyState" | "currentTime" | "paused" | "play" | "pause">;

/** Keep the picture on the audio: jump back when it drifts, play and pause with it. */
export function syncPicture(v: Picture, s: { position: number; playing: boolean; status: string }): void {
  if (v.readyState < 1) return; // no metadata yet: nothing to seek
  if (Math.abs(v.currentTime - s.position) > MAX_DRIFT_SEC) v.currentTime = s.position;
  const play = s.playing && s.status === "ready";
  if (play && v.paused) void v.play().catch(() => {});
  else if (!play && !v.paused) v.pause();
}

/** The music video id when the Song/Video chip is on Video, else undefined. */
export function useMusicVideoId(track: QueueTrack | undefined): string | undefined {
  return useTrackSourceStore((s) => {
    const rec = track ? s.byVideoId[track.videoId] : undefined;
    return rec?.selected === "video" ? rec.video : undefined;
  });
}

type Layer = { id: string; url: string };

/**
 * Which pictures to show: `front` is on screen, `back` loads behind it. A new
 * quality of the same video loads in the back and the old one keeps playing
 * until it can take over; another video (or none) replaces it outright.
 */
export function layersFor(front: Layer | null, id: string | undefined, url: string | undefined): { front: Layer | null; back: Layer | null } {
  if (!id) return { front: null, back: null };
  const same = front?.id === id ? front : null;
  if (!url) return { front: same, back: null }; // still resolving: keep what plays
  if (!same) return { front: { id, url }, back: null };
  return same.url === url ? { front: same, back: null } : { front: same, back: { id, url } };
}

/**
 * The music video, laid over the cover while the chip is on Video (like YouTube
 * Music). Picture only: it plays muted and follows the audio the engine already
 * streams (play, pause, seeks). Nothing is fetched on Song. The player card's
 * copy steps aside while fullscreen is open, so only one video ever decodes
 * (two, briefly, while a quality change loads behind the playing one).
 */
export function MusicVideo({ track, where, className }: { track: QueueTrack; where: "card" | "fullscreen"; className?: string }) {
  const id = useMusicVideoId(track);
  const hidden = useFullscreenStore((s) => where === "card" && s.open);
  const allowed = usePlaybackAllowed(id);
  const quality = usePlaybackSettings((s) => s.videoQuality);
  const on = !!id && !hidden && allowed;
  const src = useQuery({
    queryKey: ["music-video", id, quality],
    queryFn: () => invoke<string>("resolve_video_ytdlp", { videoId: id, maxHeight: quality }),
    enabled: on,
    // Stream links expire after about six hours.
    staleTime: 2 * 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
  const [front, setFront] = useState<Layer | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const layers = layersFor(front, on ? id : undefined, src.data);
  useEffect(() => {
    if (layers.front !== front) setFront(layers.front);
  }, [layers.front, front]);

  const els = useRef(new Map<string, HTMLVideoElement>());
  useEffect(() => {
    const sync = () => {
      for (const v of els.current.values()) syncPicture(v, usePlaybackStore.getState());
    };
    sync();
    return usePlaybackStore.subscribe(sync);
  }, []);

  const back = layers.back;
  // The new quality takes over once it is on the same frame as the audio.
  const promote = (v: HTMLVideoElement) => {
    if (!back || v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    if (Math.abs(v.currentTime - usePlaybackStore.getState().position) > MAX_DRIFT_SEC) return;
    setReady(back.url);
    setFront(back);
  };

  return (
    <>
      {[layers.front, back].map((l) =>
        l ? (
          // Keyed by URL, so the layer that takes over keeps its element (no reload).
          <video
            key={l.url}
            ref={(v) => {
              if (v) els.current.set(l.url, v);
              else els.current.delete(l.url);
            }}
            src={l.url}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => syncPicture(e.currentTarget, usePlaybackStore.getState())}
            onLoadedData={() => l.url === layers.front?.url && setReady(l.url)}
            onCanPlay={(e) => l.url === back?.url && promote(e.currentTarget)}
            onSeeked={(e) => l.url === back?.url && promote(e.currentTarget)}
            className={cn(
              "pointer-events-none absolute inset-0 size-full rounded-[inherit] bg-black object-contain transition-opacity duration-300",
              l.url === layers.front?.url && ready === l.url ? "opacity-100" : "opacity-0",
              className,
            )}
          />
        ) : null,
      )}
    </>
  );
}
