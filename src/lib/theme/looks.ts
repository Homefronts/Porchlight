export type LayoutId = "sidebar" | "gatefold" | "index" | "crate" | "panels";
export type FontRole = "headline" | "display" | "meta" | "body";
export type FontId =
  "instrument-serif" | "archivo" | "jetbrains-mono" | "inter" | "system";
export type Seeds = {
  bg: string;
  fg: string;
  acc: string;
  dim: string;
  faint: string;
  line: string;
};
export type Touches = {
  vinyl: boolean;
  numbers: boolean;
  uppercase: boolean;
  offsetShadows: boolean;
  tapeCounter: boolean;
  textTransport: boolean;
};
export type BuiltInId = "sleeve" | "paper" | "ink-liner" | "ink" | "classic";
export type Look = {
  id: string;
  name: string;
  base: BuiltInId;
  mode: "light" | "dark";
  seeds: Seeds;
  fonts: Record<FontRole, FontId>;
  radius: { window: number; cover: number; button: number }; // px, 0-24
  touches: Touches;
};

export const CLASSIC_ID = "classic" as const;

export const FONT_STACKS: Record<FontId, string> = {
  "instrument-serif": '"Instrument Serif", Georgia, serif',
  archivo: '"Archivo Variable", "Archivo", system-ui, sans-serif',
  "jetbrains-mono":
    '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
  inter: "'Inter Variable', system-ui, sans-serif",
  system: "system-ui, sans-serif",
};

const linerFonts: Record<FontRole, FontId> = {
  headline: "instrument-serif",
  display: "archivo",
  meta: "jetbrains-mono",
  body: "inter",
};

const allInter: Record<FontRole, FontId> = {
  headline: "inter",
  display: "inter",
  meta: "inter",
  body: "inter",
};

const linerRadius = { window: 12, cover: 0, button: 0 };

const linerTouches: Touches = {
  vinyl: true,
  numbers: true,
  uppercase: true,
  offsetShadows: false,
  tapeCounter: false,
  textTransport: false,
};

const inkSeeds: Seeds = {
  bg: "#000000",
  fg: "#f2f0eb",
  acc: "#f2f0eb",
  dim: "#8c8a85",
  faint: "#4a4946",
  line: "#1c1c1c",
};

export const BUILT_IN_LOOKS: Record<BuiltInId, Look> = {
  sleeve: {
    id: "sleeve",
    name: "Sleeve",
    base: "sleeve",
    mode: "dark",
    seeds: {
      bg: "#0e0d0c",
      fg: "#ece6da",
      dim: "#8a8378",
      faint: "#5d574e",
      line: "#2a2622",
      acc: "#ff3b5c",
    },
    fonts: linerFonts,
    radius: linerRadius,
    touches: linerTouches,
  },
  paper: {
    id: "paper",
    name: "Paper",
    base: "paper",
    mode: "light",
    seeds: {
      bg: "#efe8da",
      fg: "#1b1814",
      dim: "#6b6255",
      faint: "#a39886",
      line: "#cfc4b0",
      acc: "#d61f3c",
    },
    fonts: linerFonts,
    radius: linerRadius,
    touches: { ...linerTouches, offsetShadows: true },
  },
  "ink-liner": {
    id: "ink-liner",
    name: "Ink liner",
    base: "ink-liner",
    mode: "dark",
    seeds: inkSeeds,
    fonts: linerFonts,
    radius: linerRadius,
    touches: { ...linerTouches, vinyl: false },
  },
  ink: {
    id: "ink",
    name: "Ink",
    base: "ink",
    mode: "dark",
    seeds: { ...inkSeeds, line: "#000000" },
    fonts: allInter,
    radius: linerRadius,
    touches: {
      ...linerTouches,
      vinyl: false,
      numbers: false,
      uppercase: false,
    },
  },
  classic: {
    id: "classic",
    name: "Classic",
    base: "classic",
    mode: "dark",
    seeds: {
      bg: "#15131a",
      fg: "#f4f4f5",
      dim: "#a1a1aa",
      faint: "#6b6b74",
      line: "#26242c",
      acc: "#ff0033",
    },
    fonts: allInter,
    radius: { window: 14, cover: 6, button: 24 }, // the mockup's 99px pill, capped at the 24px range
    touches: {
      vinyl: false,
      numbers: false,
      uppercase: false,
      offsetShadows: false,
      tapeCounter: false,
      textTransport: false,
    },
  },
};
