import type { CSSProperties } from "react";
import {
  FONT_STACKS,
  isLinerLook,
  type FontId,
  type LayoutId,
  type Look,
} from "@/lib/theme/looks";
import { deriveTokens } from "@/lib/theme/tokens";
import { CrateMini } from "./miniatures/crate";
import { GatefoldMini } from "./miniatures/gatefold";
import { IndexMini } from "./miniatures/index";
import { u } from "./miniatures/parts";
import { PanelsMini } from "./miniatures/panels";
import { SidebarMini } from "./miniatures/sidebar";
import { placeholderSample, type PreviewSample } from "./placeholder-sample";

export { placeholderSample, type PreviewSample };

const MINIS = {
  sidebar: SidebarMini,
  gatefold: GatefoldMini,
  index: IndexMini,
  crate: CrateMini,
  panels: PanelsMini,
};
const LAYOUT_NAMES: Record<LayoutId, string> = {
  sidebar: "Sidebar",
  gatefold: "Gatefold",
  index: "Index",
  crate: "Crate",
  panels: "Panels",
};

// Weights follow the face the way the mockup's presets do.
const headlineWeight = (f: FontId) => (f === "instrument-serif" ? 400 : f === "archivo" ? 800 : 500);
const displayWeight = (f: FontId) => (f === "archivo" ? 900 : f === "instrument-serif" ? 400 : 600);

/**
 * The preview's own variables, read straight from the look's seeds so Classic
 * (whose app tokens live in the stylesheet, not in deriveTokens) still draws
 * in its own colours.
 */
function previewVars(look: Look): Record<string, string> {
  const { seeds, fonts, radius, touches } = look;
  return {
    "--pv-bg": seeds.bg,
    "--pv-fg": seeds.fg,
    "--pv-acc": seeds.acc,
    "--pv-dim": seeds.dim,
    "--pv-faint": seeds.faint,
    "--pv-line": seeds.line,
    "--pv-headline": FONT_STACKS[fonts.headline],
    "--pv-display": FONT_STACKS[fonts.display],
    "--pv-meta": FONT_STACKS[fonts.meta],
    "--pv-hw": String(headlineWeight(fonts.headline)),
    "--pv-tw": String(displayWeight(fonts.display)),
    "--pv-case": touches.uppercase ? "uppercase" : "none",
    "--pv-vinyl": touches.vinyl ? "block" : "none",
    "--pv-numbers": touches.numbers ? "block" : "none",
    "--pv-win-r": u(radius.window),
    "--pv-cover-r": u(radius.cover),
    "--pv-btn-r": u(radius.button),
    "--pv-cover-shadow": touches.offsetShadows
      ? `${u(3)} ${u(3)} 0 ${seeds.fg}`
      : "none",
  };
}

/**
 * A miniature of any look in any layout. Tokens are scoped to this element's
 * own style, so it never touches the app's theme. Only Sidebar is a real
 * layout today; the rest are previews.
 */
export function LookPreview({
  look,
  layout,
  sample,
}: {
  look: Look;
  layout: LayoutId;
  sample: PreviewSample;
}) {
  const Mini = MINIS[layout];
  const style = {
    ...deriveTokens(look),
    ...previewVars(look),
    // cqw units inside need a size container; 700x520 is the mockup's canvas.
    containerType: "inline-size",
    position: "relative",
    width: "100%",
    aspectRatio: "700 / 520",
    overflow: "hidden",
    borderRadius: u(look.radius.window),
    background: look.seeds.bg,
    color: look.seeds.fg,
    fontFamily: FONT_STACKS[look.fonts.body],
  } as CSSProperties;
  return (
    <div
      role="img"
      aria-label={`${look.name} look, ${LAYOUT_NAMES[layout]} layout preview`}
      style={style}
    >
      <div aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        <Mini sample={sample} liner={isLinerLook(look)} />
        {layout !== "sidebar" && (
          <div
            style={{
              position: "absolute",
              right: u(12),
              bottom: u(12),
              fontFamily: FONT_STACKS["jetbrains-mono"],
              fontSize: `max(7px, ${u(10)})`,
              letterSpacing: ".08em",
              background: "rgb(0 0 0 / .7)",
              color: "#ece6da",
              padding: `${u(5)} ${u(10)}`,
              borderRadius: 99,
            }}
          >
            PREVIEW · COMES IN A LATER UPDATE
          </div>
        )}
      </div>
    </div>
  );
}
