import { CLASSIC_ID, FONT_STACKS, type Look } from "./looks";

type RGB = [number, number, number];

const parse = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (c: RGB) =>
  "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const mix = (a: string, b: string, t: number) => {
  const [x, y] = [parse(a), parse(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t) as RGB);
};

const rgba = (hex: string, a: number) => `rgba(${parse(hex).join(", ")}, ${a})`;

const luminance = (hex: string) => {
  const [r, g, b] = parse(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Alpha steps (thousandths) of the --wNNN and --kNNN ramps in index.css.
const W_STEPS = [
  20, 28, 30, 35, 40, 45, 50, 55, 60, 70, 75, 80, 85, 90, 100, 110, 120, 140,
  150, 160, 170, 180, 200, 220, 240, 250, 260, 280, 300, 350,
];
const K_STEPS = [
  180, 200, 220, 240, 300, 320, 350, 400, 420, 550, 600, 800, 850, 900,
];
const pad = (n: number) => String(n).padStart(3, "0");

/**
 * Maps a look's six seed colours onto every custom property the `.dark`
 * block of index.css declares, so nothing is left at Classic's value.
 * Classic is the stylesheet itself, so it derives nothing.
 */
export function deriveTokens(look: Look): Record<string, string> {
  if (look.id === CLASSIC_ID) return {};
  const { bg, fg, acc, dim, faint, line } = look.seeds;

  // Readable text on the accent: whichever of bg/fg contrasts more.
  const onAcc = contrastRatio(bg, acc) > contrastRatio(fg, acc) ? bg : fg;
  const card = mix(bg, fg, 0.05);
  const raised = mix(bg, fg, 0.1);

  const t: Record<string, string> = {
    "--background": bg,
    "--foreground": fg,
    "--card": card,
    "--card-foreground": fg,
    "--popover": card,
    "--popover-foreground": fg,
    "--brand": acc,
    "--brand-foreground": onAcc,
    "--primary": acc,
    "--primary-foreground": onAcc,
    "--secondary": raised,
    "--secondary-foreground": fg,
    "--muted": raised,
    "--muted-foreground": dim,
    "--accent": rgba(fg, 0.1),
    "--accent-foreground": fg,
    "--destructive": "#f87171",
    "--destructive-foreground": "#fafafa",
    "--border": line,
    "--input": line,
    "--ring": acc,
    "--sidebar": card,
    "--sidebar-foreground": fg,
    "--sidebar-primary": acc,
    "--sidebar-primary-foreground": onAcc,
    "--sidebar-accent": rgba(fg, 0.1),
    "--sidebar-accent-foreground": fg,
    "--sidebar-border": line,
    "--sidebar-ring": acc,
    "--surface": rgba(bg, 0.3),
    "--surface-hover": rgba(bg, 0.5),
    "--surface-active": rgba(bg, 0.6),
    "--hairline": line,
    "--titlebar-hover": rgba(fg, 0.1),
    "--slider-track": rgba(fg, 0.2),
    "--slider-thumb": fg,
    "--slider-thumb-glow": `0 0 3px ${rgba(fg, 0.35)}, 0 0 8px ${rgba(fg, 0.15)}`,
    "--slider-thumb-glow-strong": `0 0 5px ${rgba(fg, 0.5)}, 0 0 12px ${rgba(fg, 0.25)}`,
    "--liked-heart-glass": rgba(fg, 0.92),
    "--liked-heart-glow": rgba(fg, 0.92),
    "--acc1": acc,
    "--acc2": mix(acc, "#ffffff", 0.15),
    "--acc3": mix(acc, "#ffffff", 0.35),
    "--acc4": mix(acc, "#ffffff", 0.55),
    "--acc5": mix(acc, "#000000", 0.1),
    "--tph": dim,
    "--win": bg,
    "--desk1": mix(bg, fg, 0.06),
    "--desk2": bg,
    "--desk3": mix(bg, "#000000", 0.4),
    "--scrim": rgba(bg, 0.48),
    "--sidepanel": rgba(bg, 0.42),
    "--glass1": rgba(bg, 0.38),
    "--glass2": rgba(bg, 0.85),
    "--glass3": rgba(card, 0.72),
    "--glass4": rgba(card, 0.82),
    "--glass5": rgba(card, 0.86),
    "--glass6": rgba(card, 0.88),
    "--fs-title": fg,
    "--fs-sub": rgba(fg, 0.62),
    "--fs-label": rgba(fg, 0.5),
    "--fs-txt": rgba(fg, 0.86),
    "--fs-txt2": rgba(fg, 0.78),
    "--fs-txt3": rgba(fg, 0.62),
    "--fs-time": rgba(fg, 0.6),
    "--fs-seg": rgba(fg, 0.55),
    "--g6a": rgba(bg, 0.5),
    "--g6b": rgba(bg, 0.55),
    "--g9a": rgba(bg, 0.42),
    "--g9b": rgba(bg, 0.2),
    "--g9c": rgba(bg, 0.86),
    "--g9d": rgba(bg, 0.62),
    "--font-headline": FONT_STACKS[look.fonts.headline],
    "--font-display": FONT_STACKS[look.fonts.display],
    "--font-meta": FONT_STACKS[look.fonts.meta],
    "--font-body": FONT_STACKS[look.fonts.body],
    "--radius-window": `${look.radius.window}px`,
    "--radius-cover": `${look.radius.cover}px`,
    "--radius-button": `${look.radius.button}px`,
  };

  // Text ramp runs from the foreground (t1) down to the faint colour (t10).
  for (let i = 1; i <= 10; i++) {
    t[`--t${i}`] = mix(fg, faint, (i - 1) / 9);
  }
  [0.05, 0.1, 0.02, 0.08, 0.12, 0.13, 0.25].forEach((a, i) => {
    t[`--surf${i + 1}`] = mix(bg, fg, a);
  });
  for (const s of W_STEPS) t[`--w${pad(s)}`] = rgba(fg, s / 1000);
  for (const s of K_STEPS) t[`--k${pad(s)}`] = rgba("#000000", s / 1000);

  return t;
}
