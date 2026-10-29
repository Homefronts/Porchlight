import { GLYPH } from "@/lib/theme/transport-glyphs";
import {
  Counter,
  Cv,
  Tabs,
  border,
  cover,
  ds,
  hd,
  m,
  u,
  type MiniProps,
} from "./parts";

const dim = { color: "var(--pv-dim)" };

function Entry({
  n,
  title,
  note,
  covers,
  tail,
  sample,
  first,
}: {
  n: string;
  title: string;
  note: string;
  covers?: number[];
  tail: string;
  sample: MiniProps["sample"];
  first?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${u(26)} 1fr auto`,
        gap: u(8),
        ...border.top,
        padding: `${u(8)} 0`,
        alignItems: "baseline",
        marginTop: first ? u(8) : 0,
      }}
    >
      <span style={{ ...m(9), color: "var(--pv-acc)" }}>{n}</span>
      <div>
        <div style={hd(19)}>
          {title} <i style={dim}>{note}</i>
        </div>
        {covers && (
          <div style={{ display: "flex", gap: u(6), marginTop: u(6) }}>
            {covers.map((k) => (
              <Cv key={k} src={cover(sample, k)} size={48} />
            ))}
          </div>
        )}
      </div>
      <span style={{ ...m(8), color: "var(--pv-faint)" }}>{tail}</span>
    </div>
  );
}

export function IndexMini({ sample }: MiniProps) {
  const np = sample.nowPlaying;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: u(10),
          padding: `${u(8)} ${u(16)}`,
          background: "var(--pv-fg)",
          color: "var(--pv-bg)",
        }}
      >
        <Cv src={np.cover} size={26} />
        <div>
          <div style={ds(11, { lineHeight: 1 })}>{np.title}</div>
          <div style={hd(10, { fontStyle: "italic" })}>{np.artist}</div>
        </div>
        <Counter
          style={{ flex: 1, color: "var(--pv-bg)" }}
          trackBg="rgb(128 128 128 / .3)"
        />
        <div style={{ ...m(8), letterSpacing: ".1em", display: "flex", gap: u(10) }}>
          <span>{GLYPH.prev}</span>
          <span>{GLYPH.pause}</span>
          <span>{GLYPH.next}</span>
          <span>LYRICS</span>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `1fr ${u(160)}`,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: `${u(14)} ${u(20)}`, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div style={hd(44, { lineHeight: 0.9 })}>Contents</div>
            <Tabs items={["HOME", "EXPLORE", "LIBRARY"]} />
          </div>
          <Entry first n="01" title="Listen again" note=": what you keep coming back to" covers={[0, 1, 2]} tail="03" sample={sample} />
          <Entry n="02" title="Mixed for you" note=": made from your listening" covers={[3, 4, 5]} tail="03" sample={sample} />
          <Entry n="03" title="Rewind" note=": your quarter so far" tail={`OPEN ${GLYPH.next}`} sample={sample} />
        </div>
        <div
          style={{
            ...border.left,
            ...m(9),
            ...dim,
            padding: `${u(14)} ${u(12)}`,
          }}
        >
          <div style={{ color: "var(--pv-faint)", letterSpacing: ".1em", padding: `${u(3)} 0` }}>
            APPENDIX · PLAYLISTS
          </div>
          {sample.playlists.slice(0, 5).map((p) => (
            <div
              key={p}
              style={{ padding: `${u(3)} 0`, borderBottom: "1px dotted var(--pv-line)" }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
