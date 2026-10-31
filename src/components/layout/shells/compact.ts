import { useSyncExternalStore } from "react";

// Below this the shells fall back to their compact forms (Panels' icon rail, etc.).
const COMPACT = "(max-width: 1099px)";

function subscribe(onChange: () => void) {
  const m = matchMedia(COMPACT);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(COMPACT).matches);
}
