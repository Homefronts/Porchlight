import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SlideSpec } from "./slides";

/**
 * Each slide's illustrated object (a record, a cassette, a clock...), drawn in
 * CSS and animated with the keyframes in rewind-story.tsx. Lives in the
 * slide's top-right frame, sized in % of it (cqw), above the words.
 */

function Vinyl({ className, style, label }: { className: string; style?: CSSProperties; label?: ReactNode }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-full bg-[#111] shadow-[0_14px_40px_rgb(0_0_0/0.35)] [background-image:repeating-radial-gradient(circle,#111_0_1.1cqw,#2a2a2a_1.1cqw_1.5cqw)] motion-safe:animate-[spin_14s_linear_infinite]",
        className,
      )}
      style={style}
    >
      <div className="grid size-[34%] place-items-center rounded-full bg-[#ffd84d] text-[12cqw] font-black tracking-[-0.05em] text-[#111]">
        {label}
      </div>
    </div>
  );
}

function Clock() {
  return (
    <div className="absolute -right-[25cqw] -top-[25cqw] size-[80cqw] rounded-full bg-[#111]" style={{ animation: "rw-breathe 5s ease-in-out infinite" }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="absolute left-[calc(50%-0.6cqw)] top-[calc(50%-2.5cqw)] h-[5cqw] w-[1.2cqw] rounded-full bg-white"
          style={{ transform: `rotate(${i * 30}deg) translateY(-32cqw)` }}
        />
      ))}
      <div className="absolute left-[calc(50%-1cqw)] top-[calc(50%-18cqw)] h-[18cqw] w-[2cqw] origin-bottom rotate-[-60deg] rounded-full bg-white" />
      <div
        className="absolute left-[calc(50%-0.6cqw)] top-[calc(50%-28cqw)] h-[28cqw] w-[1.2cqw] origin-bottom rounded-full bg-[#c6f432]"
        style={{ animation: "rw-turn 6s linear infinite" }}
      />
      <div className="absolute left-[calc(50%-2.5cqw)] top-[calc(50%-2.5cqw)] size-[5cqw] rounded-full bg-[#c6f432]" />
    </div>
  );
}

function Reel({ className }: { className: string }) {
  return (
    <div
      className={cn("absolute size-[13cqw] rounded-full border-[1.6cqw] border-white [background:repeating-conic-gradient(#fff_0deg_20deg,transparent_20deg_60deg)]", className)}
      style={{ animation: "rw-turn 2.4s linear infinite" }}
    />
  );
}

function Cassette() {
  return (
    <div className="absolute right-[6cqw] top-[12cqw] rotate-[-8deg]">
      <div className="relative h-[38cqw] w-[60cqw] rounded-[3cqw] bg-[#111] shadow-[0_14px_40px_rgb(0_0_0/0.35)]" style={{ animation: "rw-bob 4s ease-in-out infinite" }}>
        <div className="absolute inset-x-[5cqw] top-[4cqw] h-[8cqw] rounded-[1.5cqw] bg-[#c6f432]" />
        <div className="absolute inset-x-[10cqw] top-[16cqw] h-[16cqw] rounded-[8cqw] bg-[#2a2a2a]">
          <div className="absolute inset-x-[8cqw] top-[7cqw] h-[2cqw] bg-[#5a3b1e]" />
          <Reel className="left-[3cqw] top-[1.5cqw]" />
          <Reel className="right-[3cqw] top-[1.5cqw]" />
        </div>
      </div>
    </div>
  );
}

const NOTES: [string, string, string, number, number][] = [
  // glyph, right, top, size, seconds
  ["♪", "8cqw", "8cqw", 26, 3.2],
  ["♫", "38cqw", "14cqw", 20, 4.1],
  ["♬", "18cqw", "36cqw", 18, 3.6],
  ["♩", "54cqw", "4cqw", 14, 4.6],
  ["♪", "48cqw", "40cqw", 12, 3.9],
];

function Notes() {
  return (
    <>
      {NOTES.map(([g, right, top, size, sec], i) => (
        <div
          key={i}
          className={cn("absolute font-black leading-none", i % 2 ? "text-[var(--rw-hi)]" : "text-[#111]")}
          style={{ right, top, fontSize: `${size}cqw`, animation: `rw-bob ${sec}s ease-in-out ${-i * 0.7}s infinite` }}
        >
          {g}
        </div>
      ))}
    </>
  );
}

// A 16-point star.
const STAR = `polygon(${Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2;
  const r = i % 2 ? 38 : 50;
  return `${(50 + r * Math.sin(a)).toFixed(1)}% ${(50 - r * Math.cos(a)).toFixed(1)}%`;
}).join(", ")})`;

function Starburst() {
  return (
    <div className="absolute right-[40cqw] top-[50cqw] size-[24cqw]">
      <div className="absolute inset-0 bg-[#ffd84d]" style={{ clipPath: STAR, animation: "rw-turn 18s linear infinite" }} />
      <div className="absolute inset-0 grid rotate-[-12deg] place-items-center text-[9cqw] font-black tracking-[-0.05em] text-[#111]">#1</div>
    </div>
  );
}

function Medal() {
  return (
    <div className="absolute right-[14cqw] top-0 flex origin-top flex-col items-center" style={{ animation: "rw-swing 3.2s ease-in-out infinite" }}>
      <div className="flex">
        <div className="h-[30cqw] w-[8cqw] bg-[#c6f432]" />
        <div className="h-[30cqw] w-[8cqw] bg-[#7a2cff]" />
      </div>
      <div className="-mt-[2cqw] grid size-[28cqw] place-items-center rounded-full border-[2cqw] border-[#e0b23a] bg-[#ffd84d] text-[14cqw] font-black text-[#111] shadow-[0_10px_30px_rgb(0_0_0/0.4)]">
        1
      </div>
    </div>
  );
}

function Equalizer() {
  return (
    <div className="absolute right-[8cqw] top-[10cqw] flex h-[36cqw] items-end gap-[2.2cqw]">
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className={cn("h-full w-[5cqw] origin-bottom rounded-t-[1cqw]", i % 3 === 1 ? "bg-[var(--rw-hi)]" : "bg-[#111]")}
          style={{ animation: `rw-eq ${0.5 + (i % 4) * 0.13}s ease-in-out ${-i * 0.17}s infinite alternate` }}
        />
      ))}
    </div>
  );
}

function SunOrMoon({ night }: { night: boolean }) {
  return (
    <div className="absolute right-[10cqw] top-[8cqw] size-[40cqw]" style={{ animation: "rw-dawn 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both" }}>
      {night ? (
        <>
          <div className="absolute inset-[4cqw] rounded-full shadow-[inset_-9cqw_5cqw_0_0_#fff8d6]" />
          {[
            ["-2cqw", "4cqw", 0],
            ["30cqw", "-4cqw", 0.5],
            ["6cqw", "34cqw", 1],
          ].map(([left, top, delay], i) => (
            <div key={i} className="absolute text-[7cqw] text-[#111]" style={{ left: left as string, top: top as string, animation: `rw-twinkle 2s ease-in-out ${delay}s infinite` }}>
              ✦
            </div>
          ))}
        </>
      ) : (
        <>
          <div
            className="absolute -inset-[8cqw] rounded-full [background:repeating-conic-gradient(#ffd84d_0deg_10deg,transparent_10deg_30deg)] [mask-image:radial-gradient(circle,transparent_42%,black_44%)]"
            style={{ animation: "rw-turn 24s linear infinite" }}
          />
          <div className="absolute inset-[3cqw] rounded-full bg-[#ffd84d] shadow-[0_0_40px_rgb(255_216_77/0.6)]" />
        </>
      )}
    </div>
  );
}

function Speaker() {
  return (
    <div
      className="absolute -left-[16cqw] -top-[16cqw] grid size-[66cqw] place-items-center rounded-full bg-[#ffd84d] shadow-[0_14px_40px_rgb(0_0_0/0.3)]"
      style={{ animation: "rw-thump 0.9s ease-out infinite" }}
    >
      <div className="grid size-[78%] place-items-center rounded-full bg-[#111] [background-image:repeating-radial-gradient(circle,#111_0_2cqw,#2a2a2a_2cqw_2.6cqw)]">
        <div className="size-[30%] rounded-full bg-[#ffd84d] shadow-[inset_-1.5cqw_-1.5cqw_0_rgb(0_0_0/0.2)]" />
      </div>
    </div>
  );
}

function Sparkles() {
  return (
    <>
      <div className="absolute -right-[20cqw] -top-[10cqw] h-[52cqw] w-[62cqw] rounded-[48%] bg-[#7a2cff]" style={{ animation: "rw-wobble 6s ease-in-out infinite" }} />
      {[
        ["46cqw", "6cqw", 12, 0],
        ["8cqw", "46cqw", 9, 0.6],
        ["56cqw", "34cqw", 7, 1.1],
        ["24cqw", "12cqw", 6, 0.3],
      ].map(([right, top, size, delay], i) => (
        <div
          key={i}
          className={cn("absolute leading-none", i % 2 ? "text-white" : "text-[#111]")}
          style={{ right: right as string, top: top as string, fontSize: `${size}cqw`, animation: `rw-twinkle 1.8s ease-in-out ${delay}s infinite` }}
        >
          ✦
        </div>
      ))}
    </>
  );
}

const CONFETTI = ["#ffd84d", "#ff4fa3", "#c6f432", "#ffffff", "#ff8a1f", "#5ce1e6"];

/** Confetti across the whole slide (sized by the slide container, cqh/cqmin). */
export function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[60%] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
      {Array.from({ length: 18 }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 h-[3cqmin] w-[1.6cqmin] rounded-[0.3cqmin]"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI[i % CONFETTI.length],
            animation: `rw-fall ${3 + (i % 4) * 0.8}s linear ${-i * 0.45}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** The object for this slide; `cover` is the tilted album art, layered with it. */
export function SlideArt({ s, peak, quarter, cover }: { s: SlideSpec; peak: number; quarter: string; cover: ReactNode }) {
  switch (s.kind) {
    case "intro":
      return <Vinyl className="absolute -right-[30cqw] -top-[24cqw] size-[100cqw]" label={quarter} />;
    case "setup":
      return <Clock />;
    case "minutes":
      return <Cassette />;
    case "variety":
      return <Notes />;
    case "topArtist":
      return (
        <>
          {cover}
          <Starburst />
        </>
      );
    case "artists":
      return <Medal />;
    case "songs":
      return <Equalizer />;
    case "topAlbum":
      return (
        <>
          <Vinyl className="absolute right-[26cqw] top-[16cqw] size-[50cqw]" />
          {cover}
        </>
      );
    case "personality":
      return <SunOrMoon night={peak < 6 || peak >= 20} />;
    case "genres":
      return <Speaker />;
    case "newArtists":
      return <Sparkles />;
    case "summary":
      return null;
  }
}
