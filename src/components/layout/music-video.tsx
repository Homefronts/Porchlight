import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useFullscreenStore } from "@/lib/store/fullscreen";
import { usePlaybackStore, type QueueTrack } from "@/lib/store/playback";
import { usePlaybackSettings } from "@/lib/store/playback-settings";
import { usePlaybackAllowed } from "@/lib/store/premium";
import { useTrackSourceStore } from "@/lib/store/track-source";
import { getStreamBaseUrl } from "@/lib/stream";
import { cn } from "@/lib/utils";

/** Dev builds: a line in the terminal log, where webview console output doesn't reach. */
export function vlog(msg: string): void {
  if (import.meta.env.DEV) void invoke("debug_log", { msg: `[video] ${msg}` }).catch(() => {});
}

const MEDIA_ERRORS = ["", "aborted", "network", "decode", "unsupported source"];

/** Re-sync the picture when it drifts this far from the audio. */
const MAX_DRIFT_SEC = 0.4;
/** Never aim further ahead than this, however slow a jump has been. */
const MAX_LEAD_SEC = 4;

type Picture = Pick<HTMLVideoElement, "readyState" | "currentTime" | "paused" | "seeking" | "play" | "pause">;

// Per video element: when its current jump started, and how long its last one took.
const jumpStarted = new WeakMap<Picture, number>();
const jumpCost = new WeakMap<Picture, number>();

/**
 * Keep the picture on the audio. A jump (seek) has to buffer before it lands,
 * and at high quality that takes longer than the drift we allow, so jumping to
 * where the music *is* lands behind it and jumps again, forever. Instead: never
 * jump while one is still buffering, aim ahead by what the last jump cost, and
 * if it lands early, hold until the music catches up. `now` is in ms.
 */
export function syncPicture(v: Picture, s: { position: number; playing: boolean; status: string }, now = performance.now()): void {
  if (v.readyState < 1 || v.seeking) return; // no metadata yet, or a jump still buffering
  const started = jumpStarted.get(v);
  if (started !== undefined) {
    jumpCost.set(v, (now - started) / 1000);
    jumpStarted.delete(v);
  }
  const play = s.playing && s.status === "ready";
  const ahead = v.currentTime - s.position;
  if (Math.abs(ahead) > MAX_DRIFT_SEC) {
    if (play && ahead > 0 && ahead < MAX_LEAD_SEC) {
      if (!v.paused) v.pause(); // landed early: wait for the music
      return;
    }
    const lead = play ? Math.min(MAX_LEAD_SEC, (jumpCost.get(v) ?? 0.5) * 1.25 + 0.2) : 0;
    v.currentTime = s.position + lead;
    jumpStarted.set(v, now);
    return;
  }
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
 * What fullscreen's video stage does when its destination (`target`: a cover
 * frame, or "immersive") changes: crossfade once the new destination exists;
 * nothing while a new layout's frame hasn't reported yet (null), or when it
 * didn't move; no crossfade on the first arrival (nothing to cross from).
 */
export function stageSwitch(last: unknown, target: unknown): "none" | "first" | "crossfade" {
  if (!target || last === target) return "none";
  return last === null ? "first" : "crossfade";
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
    // Through the local stream server, which fetches YouTube in fast chunks:
    // YouTube throttles a browser player's open-ended read and then drops it.
    queryFn: async () => {
      const [url, base] = await Promise.all([
        invoke<string>("resolve_video_ytdlp", { videoId: id, maxHeight: quality }),
        getStreamBaseUrl(),
      ]);
      return `${base}/video?u=${encodeURIComponent(url)}`;
    },
    enabled: on,
    // Stream links expire after about six hours.
    staleTime: 2 * 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (src.error) vlog(`${id} at ${quality}p: lookup failed: ${String(src.error)}`);
  }, [src.error, id, quality]);
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
    vlog(`${back.id}: new quality took over (${v.videoWidth}x${v.videoHeight})`);
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
            // Readable by a canvas (the local server allows it), so fullscreen can
            // snapshot the frame on screen for its layout crossfade.
            crossOrigin="anonymous"
            data-front={l.url === layers.front?.url || undefined}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => syncPicture(e.currentTarget, usePlaybackStore.getState())}
            onLoadedData={(e) => {
              vlog(`${l.id}: first frame ${e.currentTarget.videoWidth}x${e.currentTarget.videoHeight} (${l.url === back?.url ? "loading behind" : "on screen"})`);
              if (l.url === layers.front?.url) setReady(l.url);
            }}
            onError={(e) => {
              const err = e.currentTarget.error;
              vlog(`${l.id}: player error ${err?.code} ${MEDIA_ERRORS[err?.code ?? 0] ?? ""} ${err?.message ?? ""} (${new URL(l.url).host})`);
            }}
            onCanPlay={(e) => l.url === back?.url && promote(e.currentTarget)}
            onSeeked={(e) => l.url === back?.url && promote(e.currentTarget)}
            // Checked on every tick too: right after a jump it is often still a little off.
            onTimeUpdate={(e) => l.url === back?.url && promote(e.currentTarget)}
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
