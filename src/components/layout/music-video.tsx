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

/**
 * The music video, laid over the cover while the chip is on Video (like YouTube
 * Music). Picture only: it plays muted and follows the audio the engine already
 * streams (play, pause, seeks). Nothing is fetched on Song. The player card's
 * copy steps aside while fullscreen is open, so only one video ever decodes.
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
  const ref = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => setShown(false), [src.data]);

  useEffect(() => {
    if (!on || !src.data) return;
    const sync = () => {
      if (ref.current) syncPicture(ref.current, usePlaybackStore.getState());
    };
    sync();
    const v = ref.current;
    v?.addEventListener("loadedmetadata", sync);
    const off = usePlaybackStore.subscribe(sync);
    return () => {
      off();
      v?.removeEventListener("loadedmetadata", sync);
    };
  }, [on, src.data]);

  if (!on || !src.data) return null;
  return (
    <video
      ref={ref}
      src={src.data}
      muted
      playsInline
      preload="auto"
      onLoadedData={() => setShown(true)}
      className={cn(
        "pointer-events-none absolute inset-0 size-full rounded-[inherit] bg-black object-contain transition-opacity duration-300",
        shown ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
