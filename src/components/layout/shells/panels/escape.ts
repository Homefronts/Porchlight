/**
 * Whether an Escape keydown is the compact Now playing overlay's to take.
 * A dialog, popover, menu or listbox open on top gets it first (Radix closes
 * those on document capture, and they're still in the DOM when it reaches window).
 */
export function escapeClosesOverlay(e: KeyboardEvent): boolean {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  return !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]');
}
