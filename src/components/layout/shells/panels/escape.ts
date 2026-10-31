/**
 * Whether an Escape keydown is the compact Now playing overlay's to take.
 * A dialog, popover, menu or listbox open on top gets it first (Radix closes
 * those on document capture, and they're still in the DOM when it reaches window).
 */
export function escapeClosesOverlay(e: KeyboardEvent): boolean {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  // Only open popups: a page can keep a listbox (or a closed menu) in the DOM.
  return !document.querySelector(
    ["dialog", "alertdialog", "menu", "listbox"].map((r) => `[role="${r}"][data-state="open"]`).join(", "),
  );
}
