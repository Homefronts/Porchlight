import type { LayoutId, Look } from "./looks";
import { useThemeStore } from "./store";

/** The dial's notches, in turning order. */
export const LAYOUT_ORDER: LayoutId[] = ["sidebar", "gatefold", "index", "crate", "panels"];

export const LAYOUT_NAMES: Record<LayoutId, string> = {
  sidebar: "Sidebar",
  gatefold: "Gatefold",
  index: "Index",
  crate: "Crate",
  panels: "Panels",
};

export function nextLayout(id: LayoutId, dir: 1 | -1 = 1): LayoutId {
  const n = LAYOUT_ORDER.length;
  return LAYOUT_ORDER[(LAYOUT_ORDER.indexOf(id) + dir + n) % n];
}

/** Ctrl+L (Cmd+L on a Mac), never while typing. */
export function shouldCycleOnKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): boolean {
  if (e.key.toLowerCase() !== "l" || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const el = e.target instanceof Element ? e.target : null;
  return !el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

export function layoutOfferText(id: LayoutId): string {
  const name = LAYOUT_NAMES[id];
  return `This look was made for ${name}. Switch to ${name}?`;
}

/**
 * Saves an imported look under Yours. Looks stay layout-free, so the layout
 * is never changed here; returns the file's layout to offer, if it differs.
 */
export function applyImport(res: { look: Look; layout: LayoutId }): LayoutId | null {
  const s = useThemeStore.getState();
  s.saveCustom(res.look);
  return res.layout === s.layout ? null : res.layout;
}
