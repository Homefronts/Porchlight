import { APP_NAME } from "@/lib/app-name";
import { commitDraft } from "./edit";
import { CLASSIC_ID, type LayoutId, type Look } from "./looks";
import { useThemeStore } from "./store";

/**
 * Until the picker is done, the active look is still the first-run choice
 * (initialLookFor), so Classic means the app was here before this update.
 */
export const isUpdater = (activeId: string) => activeId === CLASSIC_ID;

export function welcomeCopy(updater: boolean) {
  const origin = "BUILT ON YTUBIC BY NUBER";
  return {
    title: `Welcome to ${APP_NAME}.`,
    tagline: "YouTube Music, made yours.",
    // The old name is only worth naming once the app has a new one.
    origin: APP_NAME === "YTubic Plus" ? origin : `FORMERLY YTUBIC PLUS · ${origin}`,
    note: updater
      ? "Same library, same settings. Nothing changes until you pick a look."
      : null,
  };
}

// Moving focus, modifiers and screen-reader keys (Insert, CapsLock) never skip.
const KEEPS_WELCOME = new Set([
  "Tab", "Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock",
  "Insert", "NumLock", "ScrollLock", "ContextMenu", "Fn",
]);

/** Whether a keydown on the Welcome skips it ("any key"). */
export function skipsWelcome(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return !KEEPS_WELCOME.has(e.key) && !/^F\d{1,2}$/.test(e.key);
}

/** Continue: saves the picked look if it is an edited draft, then uses it. */
export function continuePicker({ look }: { look: Look; layout: LayoutId }) {
  const s = useThemeStore.getState();
  s.setActive(commitDraft(look, s));
  // Release 1 ships Sidebar only; later layouts are not saved yet.
  useThemeStore.setState({ layout: "sidebar" });
  s.markPickerSeen();
}

/** Esc: the preselected look stays exactly as it was; only the screen is done. */
export function skipPicker() {
  useThemeStore.getState().markPickerSeen();
}
