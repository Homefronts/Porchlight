import type { CSSProperties, ReactNode } from "react";
import type { PreviewSample } from "../placeholder-sample";
import { cssUrl } from "./css-url";

export type MiniProps = { sample: PreviewSample; liner: boolean };

// The miniatures are drawn on the mockup's 700px-wide canvas; one design px is
// 1/7 cqw so they scale with the preview card instead of the viewport.
export const u = (px: number) => `${+(px / 7).toFixed(3)}cqw`;

const line = "1px solid var(--pv-line)";
export const border = {
  top: { borderTop: line },
  right: { borderRight: line },
  left: { borderLeft: line },
  bottom: { borderBottom: line },
};

export const hd = (px: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: "var(--pv-headline)",
  fontWeight: "var(--pv-hw)" as CSSProperties["fontWeight"],
  fontSize: u(px),
  lineHeight: 1,
  ...extra,
});
export const ds = (px: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: "var(--pv-display)",
  fontWeight: "var(--pv-tw)" as CSSProperties["fontWeight"],
  textTransform: "var(--pv-case)" as CSSProperties["textTransform"],
  fontSize: u(px),
  lineHeight: 1.05,
  ...extra,
});
export const m = (px: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: "var(--pv-meta)",
  fontSize: u(px),
  ...extra,
});
export const subtitle = (px: number): CSSProperties =>
  hd(px, { fontStyle: "italic", color: "var(--pv-dim)" });
export const acc: CSSProperties = { color: "var(--pv-acc)" };

export const TILES = [
  "Sunday Morning Coffee",
  "Golden Hour",
  "Liked Music",
  "My Mix 03",
  "My Supermix",
  "My Mix 04",
];

export const cover = (s: PreviewSample, i: number) =>
  s.covers[i % s.covers.length] ?? "";

export function Cv({
  src,
  size,
  style,
}: {
  src?: string;
  size: number;
  style?: CSSProperties;
}) {
  // Real covers load as <img> so they go without a Referer, as in Thumbnail:
  // the image CDNs answer some referrers with an error page.
  const remote = !!src && !src.startsWith("data:");
  return (
    <div
      style={{
        width: u(size),
        height: u(size),
        flex: "none",
        borderRadius: "var(--pv-cover-r)",
        boxShadow: "var(--pv-cover-shadow)",
        // "" means no art was given: draw a shape in the look's colours.
        background: remote
          ? undefined
          : src
            ? `center / cover no-repeat ${cssUrl(src)}`
            : "linear-gradient(135deg, var(--pv-acc), var(--pv-dim))",
        ...style,
      }}
    >
      {remote && (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          decoding="async"
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
        />
      )}
    </div>
  );
}

export function Tabs({
  items,
  style,
}: {
  items: string[];
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: u(12),
        ...m(8),
        letterSpacing: ".1em",
        color: "var(--pv-dim)",
        ...style,
      }}
    >
      {items.map((t, k) => (
        <span
          key={t}
          style={
            k === 0
              ? {
                  color: "var(--pv-fg)",
                  borderBottom: `${u(2)} solid var(--pv-acc)`,
                  paddingBottom: u(2),
                }
              : undefined
          }
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function Counter({
  style,
  trackBg,
}: {
  style?: CSSProperties;
  trackBg?: string;
}) {
  return (
    <div
      style={{
        ...m(8),
        color: "var(--pv-dim)",
        display: "flex",
        alignItems: "center",
        gap: u(6),
        ...style,
      }}
    >
      <span>01:13</span>
      <div
        style={{
          flex: 1,
          height: u(2),
          background: trackBg ?? "var(--pv-line)",
          position: "relative",
        }}
      >
        <b
          style={{
            position: "absolute",
            inset: "0 66% 0 0",
            background: "var(--pv-acc)",
          }}
        />
      </div>
      <span>03:36</span>
    </div>
  );
}

export const PlayBtn = ({
  children,
  pad = 7,
}: {
  children: ReactNode;
  pad?: number;
}) => (
  <span
    style={{
      background: "var(--pv-fg)",
      color: "var(--pv-bg)",
      padding: `${u(2)} ${u(pad)}`,
      borderRadius: "var(--pv-btn-r)",
    }}
  >
    {children}
  </span>
);

export const Rule = ({ left, right }: { left: string; right: string }) => (
  <div
    style={{
      ...m(8),
      ...border.top,
      color: "var(--pv-faint)",
      paddingTop: u(4),
      margin: `${u(10)} 0 ${u(8)}`,
      letterSpacing: ".08em",
      display: "flex",
      justifyContent: "space-between",
    }}
  >
    <span>{left}</span>
    <span>{right}</span>
  </div>
);

export const Greeting = ({ name, px }: { name: string; px: number }) => (
  <div style={hd(px)}>
    Good evening, <i style={{ color: "var(--pv-dim)" }}>{name}.</i>
  </div>
);

export const Logo = ({ liner, px }: { liner: boolean; px: number }) => (
  <div style={ds(px, { lineHeight: 0.95 })}>
    {liner ? (
      <>
        YTUBIC
        <br />
        PLUS
        <span style={acc}>.</span>
      </>
    ) : (
      "YTubic Plus"
    )}
  </div>
);
