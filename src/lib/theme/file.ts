import {
  BUILT_IN_LOOKS,
  type BuiltInId,
  type FontId,
  type FontRole,
  type LayoutId,
  type Look,
  type Seeds,
  type Touches,
} from "./looks";

export const THEME_FILE_VERSION = 1;
const MAX_BYTES = 1_000_000;
const MAX_TEXT = 60;

export type ThemeFile = {
  ytubicPlusTheme: 1;
  name: string;
  author?: string;
  layout: LayoutId;
  look: Omit<Look, "id">;
};

export type ParseResult =
  | { ok: true; look: Look; layout: LayoutId; notes: string[] }
  | { ok: false; error: string };

export function toThemeFile(
  look: Look,
  layout: LayoutId,
  author?: string,
): string {
  const { id: _id, ...rest } = look;
  const file: ThemeFile = {
    ytubicPlusTheme: THEME_FILE_VERSION,
    name: look.name,
    ...(author ? { author } : {}),
    layout,
    look: rest,
  };
  return JSON.stringify(file, null, 2);
}

const BASES = Object.keys(BUILT_IN_LOOKS) as BuiltInId[];
const LAYOUTS: LayoutId[] = ["sidebar", "gatefold", "index", "crate", "panels"];
const FONTS: FontId[] = [
  "instrument-serif",
  "archivo",
  "jetbrains-mono",
  "inter",
  "system",
];
const FONT_ROLES: FontRole[] = ["headline", "display", "meta", "body"];
const SEED_KEYS = ["bg", "fg", "acc", "dim", "faint", "line"] as const;
const RADIUS_KEYS = ["window", "cover", "button"] as const;
const TOUCH_KEYS = [
  "vinyl",
  "numbers",
  "uppercase",
  "offsetShadows",
  "tapeCounter",
  "textTransport",
] as const;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Strangers' text ends up in menus: drop control characters, trim, cap. */
function cleanText(v: unknown): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, MAX_TEXT);
}

function expandHex(c: string): string {
  const h = c.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

export function parseThemeFile(text: string): ParseResult {
  if (text.length > MAX_BYTES) {
    return { ok: false, error: "That file is too big to be a theme file." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isObj(raw) || raw.ytubicPlusTheme === undefined) {
    return { ok: false, error: "That is not a YTubic Plus theme file." };
  }
  if (raw.ytubicPlusTheme !== THEME_FILE_VERSION) {
    return {
      ok: false,
      error:
        "This theme file is from a newer version. Update the app to import it.",
    };
  }

  const notes: string[] = [];
  const src = isObj(raw.look) ? raw.look : {};
  if (!isObj(raw.look)) notes.push("The look section is missing, so the base look was used.");

  let base: BuiltInId = "sleeve";
  if (BASES.includes(src.base as BuiltInId)) base = src.base as BuiltInId;
  else notes.push("Unknown base look, so Sleeve was used as the base.");
  const b = BUILT_IN_LOOKS[base];

  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, what: string): T => {
    if (allowed.includes(v as T)) return v as T;
    notes.push(`Ignored a bad ${what}.`);
    return fallback;
  };

  const mode = pick(src.mode, ["light", "dark"] as const, b.mode, "light/dark mode");

  const seedsIn = isObj(src.seeds) ? src.seeds : {};
  const seeds = { ...b.seeds } as Seeds;
  for (const k of SEED_KEYS) {
    const v = seedsIn[k];
    if (typeof v === "string" && HEX.test(v)) seeds[k] = expandHex(v);
    else notes.push(`Ignored a bad ${k} colour.`);
  }

  const fontsIn = isObj(src.fonts) ? src.fonts : {};
  const fonts = { ...b.fonts };
  for (const r of FONT_ROLES) fonts[r] = pick(fontsIn[r], FONTS, b.fonts[r], `${r} font`);

  const radiusIn = isObj(src.radius) ? src.radius : {};
  const radius = { ...b.radius };
  for (const k of RADIUS_KEYS) {
    const v = radiusIn[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      radius[k] = Math.min(24, Math.max(0, v));
    } else notes.push(`Ignored a bad ${k} corner radius.`);
  }

  const touchesIn = isObj(src.touches) ? src.touches : {};
  const touches = { ...b.touches } as Touches;
  for (const k of TOUCH_KEYS) {
    if (typeof touchesIn[k] === "boolean") touches[k] = touchesIn[k] as boolean;
    else notes.push(`Ignored a bad ${k} switch.`);
  }

  // Release 1 builds Sidebar only; every other known layout falls back to it.
  let layout: LayoutId = "sidebar";
  if (raw.layout !== "sidebar") {
    if (LAYOUTS.includes(raw.layout as LayoutId)) {
      const l = raw.layout as string;
      notes.push(
        `This look was made for the ${l[0].toUpperCase()}${l.slice(1)} layout, which arrives in a later update.`,
      );
    } else {
      notes.push("Unknown layout, so the sidebar layout was used.");
    }
  }

  const name = cleanText(raw.name) || cleanText(src.name) || `${b.name} copy`;

  return {
    ok: true,
    layout,
    notes,
    look: { id: "imported", name, base, mode, seeds, fonts, radius, touches },
  };
}
