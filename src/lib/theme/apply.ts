import { BUILT_IN_LOOKS, CLASSIC_ID, type Look } from "./looks";
import { deriveTokens } from "./tokens";
import { activeLook, useThemeStore } from "./store";

const TOUCH_ATTRS = {
  vinyl: "data-touch-vinyl",
  numbers: "data-touch-numbers",
  uppercase: "data-touch-uppercase",
  offsetShadows: "data-touch-offset-shadows",
  tapeCounter: "data-touch-tape-counter",
  textTransport: "data-touch-text-transport",
} as const;

// Only these are removed on the next apply: other code (interface-font) also
// writes to <html>.style and must survive a look change.
const setProps = new WeakMap<HTMLElement, string[]>();

/** Writes a look onto <html>; Classic leaves no trace at all. */
export function applyLook(look: Look, root: HTMLElement = document.documentElement): void {
  for (const p of setProps.get(root) ?? []) root.style.removeProperty(p);
  for (const a of Object.values(TOUCH_ATTRS)) root.removeAttribute(a);
  root.removeAttribute("data-look");
  setProps.set(root, []);
  if (look.id === CLASSIC_ID) return;

  const tokens = deriveTokens(look);
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  setProps.set(root, Object.keys(tokens));
  root.setAttribute("data-look", look.id);
  for (const [key, attr] of Object.entries(TOUCH_ATTRS)) {
    root.setAttribute(attr, look.touches[key as keyof typeof TOUCH_ATTRS] ? "on" : "off");
  }
}

/** Applies a stored look; a damaged one (old build, hand-edited storage) falls back to Classic so the app still opens. */
export function applySavedLook(look: Look, root: HTMLElement = document.documentElement): void {
  try {
    applyLook(look, root);
  } catch (e) {
    console.error("[theme] could not apply look, using Classic", e);
    applyLook(BUILT_IN_LOOKS.classic, root);
  }
}

// Imported once from main.tsx, so both windows apply the look.
if (typeof document !== "undefined") {
  applySavedLook(activeLook(useThemeStore.getState()));
  useThemeStore.subscribe((s, prev) => {
    if (s.activeId !== prev.activeId || s.custom !== prev.custom) {
      applySavedLook(activeLook(s));
    }
  });
}
