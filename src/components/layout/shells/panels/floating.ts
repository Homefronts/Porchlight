import { useLayoutStore, type LayoutMode } from "@/lib/store/layout";

// The mode floating replaced, so popping back in restores Sidebar's card or bar.
// Tracked from the store so a Sidebar pick (More menu, Settings, drag) counts too.
let docked: LayoutMode = "right";
const track = (mode: LayoutMode) => {
  if (mode !== "floating") docked = mode;
};
track(useLayoutStore.getState().mode);
useLayoutStore.subscribe((s) => track(s.mode));

/** The pop-out button: floating on or off. The layout's own player stays either way. */
export function toggleFloating(): void {
  const { mode, setMode } = useLayoutStore.getState();
  setMode(mode === "floating" ? docked : "floating");
}
