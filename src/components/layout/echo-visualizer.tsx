import { useEffect, useRef, useState } from "react";
import { pickThumbnail } from "@/components/shared/thumbnail";
import type { QueueTrack } from "@/lib/store/playback";
import { currentAnalyser } from "@/lib/audio-graph";
import { pickCoverColour } from "@/lib/cover-colour";

const POINTS = 64;
// Each trail follows the one before it more slowly, and is fainter and thinner.
const TRAILS = [
  { follow: 0.05, alpha: 0.28, width: 2, lag: 0.9 },
  { follow: 0.12, alpha: 0.5, width: 2.2, lag: 0.45 },
  { follow: 1, alpha: 0.95, width: 3, lag: 0 },
];

/** The cover's main colour, or null if the image can't be read. */
function useCoverColour(track: QueueTrack, light: boolean): string | null {
  const url = pickThumbnail(track.thumbnails, 64);
  const [colour, setColour] = useState<string | null>(null);
  useEffect(() => {
    setColour(null);
    if (!url) return;
    let gone = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (gone) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 24;
        const g = canvas.getContext("2d", { willReadFrequently: true });
        if (!g) return;
        g.drawImage(img, 0, 0, 24, 24);
        setColour(pickCoverColour(g.getImageData(0, 0, 24, 24).data, light));
      } catch {
        // The image host refused to let it be read: the look's accent stands in.
      }
    };
    img.src = url;
    return () => {
      gone = true;
    };
  }, [url, light]);
  return colour;
}

/**
 * Three lines moving with the music, in the cover's colour, across the bottom
 * of the full-screen player. Flat when nothing is playing. Reduced motion
 * leaves it out.
 */
export function EchoVisualizer({ track, light }: { track: QueueTrack; light: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const colour = useCoverColour(track, light);
  const stroke = useRef("");
  stroke.current = colour ?? "var(--brand)";

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext("2d");
    if (!el || !g || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const trails = TRAILS.map(() => new Float32Array(POINTS));
    let bins = new Uint8Array(0);
    let frame = 0;
    const fit = () => {
      const scale = devicePixelRatio || 1;
      el.width = el.clientWidth * scale;
      el.height = el.clientHeight * scale;
      g.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const analyser = currentAnalyser();
      if (analyser && bins.length !== analyser.frequencyBinCount) {
        bins = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser?.getByteFrequencyData(bins);
      const w = el.clientWidth;
      const h = el.clientHeight;
      const t = now / 1000;
      g.clearRect(0, 0, w, h);
      // A canvas can't read a CSS variable through strokeStyle, so resolve it here.
      const paint = stroke.current.startsWith("var(")
        ? getComputedStyle(el).getPropertyValue("--brand").trim()
        : stroke.current;
      g.strokeStyle = paint;
      g.lineCap = "round";
      TRAILS.forEach(({ follow, alpha, width, lag }, n) => {
        const values = trails[n];
        const points: [number, number][] = [];
        for (let i = 0; i < POINTS; i++) {
          // The low end of the spectrum holds nearly all the movement, so it gets more points.
          const bin = Math.floor(Math.pow(i / POINTS, 2) * bins.length * 0.7);
          const want = (bins[bin] ?? 0) / 255;
          values[i] += (want - values[i]) * (want > values[i] ? Math.max(follow, 0.45 * follow + 0.04) : follow * 0.3);
          const edge = Math.sin((i / (POINTS - 1)) * Math.PI);
          const x = w * (0.055 + 0.89 * (i / (POINTS - 1)));
          points.push([x, h / 2 + Math.sin(i * 0.42 + (t - lag) * 2.4) * values[i] * (h * 0.44) * edge]);
        }
        g.beginPath();
        g.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < POINTS; i++) {
          const mid = (points[i - 1][0] + points[i][0]) / 2;
          g.bezierCurveTo(mid, points[i - 1][1], mid, points[i][1], points[i][0], points[i][1]);
        }
        g.globalAlpha = alpha;
        g.lineWidth = width;
        g.stroke();
      });
      g.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-[108px] h-[140px] w-full"
    />
  );
}
