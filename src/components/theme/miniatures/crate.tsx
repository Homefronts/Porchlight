import {
  Counter,
  Cv,
  Logo,
  PlayBtn,
  Tabs,
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

// Three slanted sleeves flipping past a larger one, as in the mockup.
const SLEEVES = [
  { left: 0, k: 4, t: "rotateX(12deg) rotateY(38deg) scale(.82)" },
  { left: 45, k: 5, t: "rotateX(10deg) rotateY(32deg) scale(.88)" },
  { left: 90, k: 3, t: "rotateX(8deg) rotateY(26deg) scale(.94)" },
];

export function CrateMini({ sample, liner }: MiniProps) {
  const np = sample.nowPlaying;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          ...border.bottom,
          display: "flex",
          alignItems: "center",
          gap: u(18),
          padding: `${u(10)} ${u(16)}`,
        }}
      >
        <Logo liner={liner} px={12} />
        <Tabs items={["HOME", "EXPLORE", "LIBRARY", "REWIND"]} />
        <div
          style={{
            ...m(8),
            marginLeft: "auto",
            color: "var(--pv-faint)",
            border: "1px solid var(--pv-line)",
            padding: `${u(4)} ${u(8)}`,
            width: u(120),
          }}
        >
          ⌕ SEARCH THE CRATE…
        </div>
      </header>
      <div
        style={{
          flex: 1,
          padding: `${u(12)} ${u(16)}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={hd(28)}>
          Good evening, <i style={{ color: "var(--pv-dim)" }}>{sample.name}.</i>
        </div>
        <div
          style={{
            position: "relative",
            height: u(190),
            marginTop: u(10),
            perspective: u(900),
          }}
        >
          {SLEEVES.map(({ left, k, t }) => (
            <div
              key={k}
              style={{ position: "absolute", top: u(14), left: u(left), transform: t }}
            >
              <Cv
                src={cover(sample, k)}
                size={130}
                style={{ boxShadow: `${u(-5)} 0 ${u(12)} rgb(0 0 0 / .55)` }}
              />
            </div>
          ))}
          <div
            style={{
              position: "absolute",
              left: u(215),
              top: 0,
              display: "flex",
              gap: u(16),
              alignItems: "flex-end",
            }}
          >
            <Cv
              src={cover(sample, 1)}
              size={165}
              style={{ boxShadow: `0 ${u(12)} ${u(26)} rgb(0 0 0 / .55)` }}
            />
            <div>
              <div style={{ ...m(8), ...acc, letterSpacing: ".1em" }}>
                A2 · SONG
              </div>
              <div style={ds(20, { lineHeight: 0.95 })}>
                Golden
                <br />
                Hour
              </div>
              <div style={subtitle(14)}>Sample Artist</div>
              <div style={{ display: "flex", gap: u(12), ...m(8), marginTop: u(8), color: "var(--pv-dim)" }}>
                <PlayBtn>▸ PLAY</PlayBtn>
                <span>+ QUEUE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer
        style={{
          ...border.top,
          height: u(74),
          display: "flex",
          alignItems: "center",
          gap: u(12),
          padding: `0 ${u(16)}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: u(90),
            height: u(90),
            borderRadius: "50%",
            flex: "none",
            marginTop: u(30),
            position: "relative",
            background:
              "repeating-radial-gradient(circle, #0a0a0a 0 2px, #151515 2px 3px)",
          }}
        >
          <Cv
            src={np.cover}
            size={28}
            style={{ position: "absolute", left: u(31), top: u(31), borderRadius: "50%", boxShadow: "none" }}
          />
        </div>
        <div>
          <div style={ds(13, { lineHeight: 1 })}>{np.title}</div>
          <div style={subtitle(12)}>{np.artist}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: u(5) }}>
          <div style={{ ...m(8), display: "flex", justifyContent: "center", gap: u(12), color: "var(--pv-dim)" }}>
            <span>◂◂</span>
            <PlayBtn>❚❚ PAUSE</PlayBtn>
            <span>▸▸</span>
          </div>
          <Counter />
        </div>
      </footer>
    </div>
  );
}
