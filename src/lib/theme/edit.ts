import { contrastRatio } from "./tokens";
import { BUILT_IN_LOOKS, CLASSIC_ID, type Look, type Seeds } from "./looks";

// Classic's light palette, read off the :root block of index.css (Classic
// itself is the stylesheet; BUILT_IN_LOOKS only carries its dark seeds).
export const CLASSIC_LIGHT_SEEDS: Seeds = {
  bg: "#ffffff",
  fg: "#18181b",
  acc: "#fa1f4b",
  dim: "#6b6b74",
  faint: "#a2a2aa",
  line: "#e5e5e5",
};

/** Classic shows the palette of the light / dark mode in use; others are fixed. */
export function paletteInUse(look: Look, mode: "light" | "dark"): Look {
  if (look.id !== CLASSIC_ID || mode === "dark") return look;
  return { ...look, mode: "light", seeds: CLASSIC_LIGHT_SEEDS };
}

/** The built-in a look started from, in the look's own mode (its "default"). */
export const baseOf = (look: Look): Look =>
  paletteInUse(BUILT_IN_LOOKS[look.base], look.mode);

export const isBuiltIn = (look: Look) => look.id in BUILT_IN_LOOKS;

/**
 * Applies an edit. Built-ins never change: editing one gives a draft named
 * "<Base>, edited" with no id yet, for saveCustom to assign.
 */
export function editLook(look: Look, patch: Partial<Look>): Look {
  if (!isBuiltIn(look)) return { ...look, ...patch };
  return {
    ...look,
    ...patch,
    id: "",
    name: `${BUILT_IN_LOOKS[look.base].name}, edited`,
  };
}

/** Under 3:1 the main text is hard to read on the background. */
export const lowContrast = (s: Seeds) => contrastRatio(s.fg, s.bg) < 3;

/** Such a look asks for confirmation before it becomes the app's look. */
export const isUnreadable = (look: Look) => lowContrast(look.seeds);

/**
 * Saves the editor's draft and returns the id to make active. A built-in, or
 * a custom look identical to its saved copy, is not written again.
 */
export function commitDraft(
  look: Look,
  store: { custom: Look[]; saveCustom(look: Look): string },
): string {
  if (isBuiltIn(look)) return look.id;
  const saved = store.custom.find((l) => l.id === look.id);
  if (saved && JSON.stringify(saved) === JSON.stringify(look)) return look.id;
  return store.saveCustom(look);
}
