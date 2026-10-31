import { useLayoutStore, type LayoutMode } from "@/lib/store/layout";

// The mode floating replaced, so popping back in restores Sidebar's card or bar.
let docked: LayoutMode = "right";

/** The pop-out button: floating on or off. The layout's own player stays either way. */
export function toggleFloating(): void {
  const { mode, setMode } = useLayoutStore.getState();
  if (mode === "floating") return setMode(docked);
  docked = mode;
  setMode("floating");
}
