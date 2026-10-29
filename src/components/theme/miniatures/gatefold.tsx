import { GLYPH } from "@/lib/theme/transport-glyphs";
import {
  Counter,
  Cv,
  PlayBtn,
  Rule,
  Tabs,
  TILES,
  acc,
  border,
  cover,
  ds,
  hd,
  m,
  subtitle,
  u,
  type MiniProps,
} from "./parts";

export function GatefoldMini({ sample }: MiniProps) {
  const np = sample.nowPlaying;
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}
    >
      <div
        style={{
          ...border.right,
          padding: `${u(18)} ${u(20)}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ ...m(8), ...acc, letterSpacing: ".1em" }}>
          ● NOW PLAYING
        </div>
        <div style={{ display: "flex", gap: u(12), marginTop: u(10) }}>
          <Cv src={np.cover} size={120} />
          <div>
            <div style={ds(20, { lineHeight: 0.95 })}>{np.title}</div>
            <div style={subtitle(15)}>{np.artist}</div>
            <div style={{ ...m(8), color: "var(--pv-dim)", marginTop: u(8) }}>
              TIME 3:36 · FROM LATE NIGHT
            </div>
          </div>
        </div>
        <div
          style={hd(17, {
            marginTop: u(14),
            lineHeight: 1.25,
            color: "var(--pv-faint)",
          })}
        >
          <div>Hold on</div>
          <div style={{ color: "var(--pv-fg)" }}>
            Streetlights hum the second verse
          </div>
          <div>Every window lit like a radio</div>
        </div>
        <div style={{ marginTop: "auto" }}>
          <Counter />
          <div
            style={{
              ...m(8),
              display: "flex",
              justifyContent: "space-between",
              marginTop: u(8),
              letterSpacing: ".1em",
              color: "var(--pv-dim)",
            }}
          >
            <span>{GLYPH.prev} PREV</span>
            <PlayBtn>{GLYPH.pause} PAUSE</PlayBtn>
            <span>NEXT {GLYPH.next}</span>
            <span>QUEUE</span>
          </div>
        </div>
      </div>
      <div style={{ padding: `${u(16)} ${u(18)}`, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Tabs items={["HOME", "EXPLORE", "SEARCH", "LIBRARY"]} />
          <span style={ds(10)}>
            YTUBIC PLUS<span style={acc}>.</span>
          </span>
        </div>
        <div style={hd(28, { marginTop: u(12) })}>
          Good evening, <i style={{ color: "var(--pv-dim)" }}>{sample.name}.</i>
        </div>
        <Rule left="SIDE A · LISTEN AGAIN" right="03" />
        <div style={{ display: "flex", gap: u(9), flexWrap: "wrap" }}>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ width: u(68) }}>
              <Cv src={cover(sample, k)} size={68} />
              <div style={ds(8, { marginTop: u(4) })}>{TILES[k]}</div>
            </div>
          ))}
        </div>
        <Rule left="YOUR PLAYLISTS" right="04" />
        <div style={{ ...m(9), color: "var(--pv-dim)", columns: 2 }}>
          {sample.playlists.slice(0, 4).map((p, k) => (
            <div key={p}>
              0{k + 1} {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
