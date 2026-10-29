import { GLYPH } from "@/lib/theme/transport-glyphs";
import {
  Counter,
  Cv,
  Greeting,
  Logo,
  PlayBtn,
  Rule,
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

function Tile({
  k,
  sample,
  vinyl,
}: {
  k: number;
  sample: MiniProps["sample"];
  vinyl?: boolean;
}) {
  return (
    <div style={{ width: u(92), position: "relative" }}>
      {vinyl && (
        <div
          style={{
            position: "absolute",
            top: u(4),
            left: u(22),
            width: u(86),
            height: u(86),
            borderRadius: "50%",
            display: "var(--pv-vinyl)",
            background:
              "radial-gradient(circle, var(--pv-acc) 0 13%, #111 14% 16%, #0a0a0a 17% 100%)",
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <Cv src={cover(sample, k)} size={92} />
      </div>
      <div
        style={{
          ...m(9),
          color: "var(--pv-faint)",
          marginTop: u(6),
          display: "var(--pv-numbers)",
        }}
      >
        {k < 3 ? "A" : "B"}
        {(k % 3) + 1}
      </div>
      <div style={ds(10, { marginTop: u(5), lineHeight: 1.15 })}>
        {TILES[k]}
      </div>
    </div>
  );
}

export function SidebarMini({ sample, liner }: MiniProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${u(150)} 1fr ${u(210)}`,
        height: "100%",
      }}
    >
      <nav
        style={{
          ...border.right,
          ...m(10),
          padding: `${u(18)} ${u(14)}`,
          color: "var(--pv-dim)",
          display: "flex",
          flexDirection: "column",
          gap: u(5),
        }}
      >
        <div style={{ marginBottom: u(14), color: "var(--pv-fg)" }}>
          <Logo liner={liner} px={16} />
        </div>
        <div style={{ color: "var(--pv-fg)" }}>
          {liner && <span style={acc}>▸ </span>}Home
        </div>
        <div>Explore</div>
        <div>Search</div>
        <div>Library</div>
        <div>Rewind</div>
        <div style={{ height: u(10) }} />
        {sample.playlists.slice(0, 4).map((p) => (
          <div key={p}>{p}</div>
        ))}
      </nav>
      <main style={{ padding: u(18), overflow: "hidden" }}>
        <Greeting name={sample.name} px={34} />
        <Rule left="SIDE A · LISTEN AGAIN" right="03" />
        <div style={{ display: "flex", gap: u(12) }}>
          {[0, 1, 2].map((k) => (
            <Tile key={k} k={k} sample={sample} vinyl={k === 0} />
          ))}
        </div>
        <Rule left="SIDE B · MIXED FOR YOU" right="03" />
        <div style={{ display: "flex", gap: u(12) }}>
          {[3, 4, 5].map((k) => (
            <Tile key={k} k={k} sample={sample} />
          ))}
        </div>
      </main>
      <aside style={{ ...border.left, padding: `${u(16)} ${u(14)}` }}>
        <div style={{ ...m(9), ...acc, letterSpacing: ".1em" }}>
          ● NOW PLAYING
        </div>
        <div style={{ marginTop: u(8) }}>
          <Cv src={sample.nowPlaying.cover} size={180} />
        </div>
        <div style={ds(17, { marginTop: u(10), lineHeight: 1 })}>
          {sample.nowPlaying.title}
        </div>
        <div style={subtitle(14)}>{sample.nowPlaying.artist}</div>
        <Counter style={{ marginTop: u(9), fontSize: u(9) }} />
        <div
          style={{
            ...m(8),
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: u(9),
            letterSpacing: ".1em",
            color: "var(--pv-dim)",
          }}
        >
          <span>{GLYPH.prev}</span>
          <PlayBtn pad={7}>{GLYPH.pause} PAUSE</PlayBtn>
          <span>{GLYPH.next}</span>
        </div>
        <div
          style={hd(15, {
            marginTop: u(12),
            lineHeight: 1.3,
            color: "var(--pv-faint)",
          })}
        >
          <div>Hold on</div>
          <div style={{ color: "var(--pv-fg)" }}>
            Streetlights hum the second verse
          </div>
        </div>
      </aside>
    </div>
  );
}
