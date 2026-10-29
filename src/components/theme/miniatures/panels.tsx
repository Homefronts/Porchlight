import { GLYPH } from "@/lib/theme/transport-glyphs";
import type { CSSProperties, ReactNode } from "react";
import {
  Counter,
  Cv,
  PlayBtn,
  cover,
  ds,
  hd,
  m,
  subtitle,
  u,
  type MiniProps,
} from "./parts";

function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--pv-bg)",
        borderRadius: `calc(var(--pv-win-r) / 2 + ${u(2)})`,
        overflow: "hidden",
        padding: u(12),
        border: "1px solid var(--pv-line)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const QUICK = [
  ["Liked Music", 2],
  ["My Supermix", 4],
  ["Golden Hour", 1],
  ["My Mix 03", 3],
] as const;

export function PanelsMini({ sample }: MiniProps) {
  const np = sample.nowPlaying;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${u(140)} 1fr ${u(170)}`,
        gridTemplateRows: `1fr ${u(50)}`,
        gap: u(6),
        padding: u(6),
        boxSizing: "border-box",
        height: "100%",
        background: "color-mix(in srgb, var(--pv-bg) 70%, #000)",
      }}
    >
      <Panel
        style={{
          ...m(9),
          color: "var(--pv-dim)",
          display: "flex",
          flexDirection: "column",
          gap: u(5),
        }}
      >
        <div style={ds(12, { color: "var(--pv-fg)", marginBottom: u(6) })}>
          YTubic Plus
        </div>
        <div style={{ color: "var(--pv-fg)" }}>⌂ Home</div>
        <div>⌕ Search</div>
        <div>◎ Explore</div>
        <div>↺ Rewind</div>
        <div style={{ marginTop: u(8), color: "var(--pv-faint)" }}>
          YOUR LIBRARY
        </div>
        {sample.playlists.slice(0, 4).map((p) => (
          <div key={p}>{p}</div>
        ))}
      </Panel>
      <Panel
        style={{
          background:
            "linear-gradient(color-mix(in srgb, var(--pv-acc) 22%, var(--pv-bg)) 0, var(--pv-bg) 150px)",
        }}
      >
        <div style={hd(24)}>
          Good evening, <i style={{ color: "var(--pv-dim)" }}>{sample.name}.</i>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: u(6),
            margin: `${u(10)} 0 ${u(12)}`,
          }}
        >
          {QUICK.map(([t, k]) => (
            <div
              key={t}
              style={{
                ...ds(9),
                display: "flex",
                alignItems: "center",
                gap: u(7),
                background: "color-mix(in srgb, var(--pv-fg) 8%, transparent)",
                borderRadius: "var(--pv-cover-r)",
                overflow: "hidden",
              }}
            >
              <Cv src={cover(sample, k)} size={30} style={{ boxShadow: "none" }} />
              {t}
            </div>
          ))}
        </div>
        <div style={ds(12)}>Mixed for you</div>
        <div style={{ display: "flex", gap: u(9), marginTop: u(6) }}>
          {[3, 4, 5].map((k) => (
            <Cv key={k} src={cover(sample, k)} size={78} />
          ))}
        </div>
      </Panel>
      <Panel>
        <Cv src={np.cover} size={146} />
        <div style={ds(13, { marginTop: u(8) })}>{np.title}</div>
        <div style={subtitle(12)}>{np.artist}</div>
        <div
          style={hd(13, {
            marginTop: u(10),
            lineHeight: 1.3,
            color: "var(--pv-faint)",
          })}
        >
          <div>Hold on</div>
          <div style={{ color: "var(--pv-fg)" }}>
            Streetlights hum the second verse
          </div>
        </div>
      </Panel>
      <footer
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          gap: u(10),
          padding: `0 ${u(8)}`,
        }}
      >
        <Cv src={np.cover} size={34} />
        <div style={{ width: u(110) }}>
          <div style={ds(10)}>{np.title}</div>
          <div style={{ fontSize: u(9), color: "var(--pv-dim)" }}>{np.artist}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: u(5) }}>
          <div style={{ ...m(8), display: "flex", justifyContent: "center", gap: u(12), color: "var(--pv-dim)" }}>
            <span>{GLYPH.prev}</span>
            <PlayBtn>{GLYPH.pause}</PlayBtn>
            <span>{GLYPH.next}</span>
          </div>
          <Counter />
        </div>
        <div style={{ width: u(110) }} />
      </footer>
    </div>
  );
}
