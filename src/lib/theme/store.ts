import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BUILT_IN_LOOKS,
  CLASSIC_ID,
  type BuiltInId,
  type LayoutId,
  type Look,
} from "./looks";

type ThemeState = {
  activeId: string;
  layout: LayoutId;
  custom: Look[];
  pickerSeen: boolean;
  setActive(id: string): void;
  saveCustom(look: Look): string;
  renameCustom(id: string, name: string): void;
  deleteCustom(id: string): void;
  markPickerSeen(): void;
};

/** Existing installs keep their Classic app; new ones start on Sleeve. */
export function initialLookFor(hadPreviousInstall: boolean): BuiltInId {
  return hadPreviousInstall ? CLASSIC_ID : "sleeve";
}

export function activeLook(s: Pick<ThemeState, "activeId" | "custom">): Look {
  return (
    s.custom.find((l) => l.id === s.activeId) ??
    (BUILT_IN_LOOKS as Record<string, Look>)[s.activeId] ??
    BUILT_IN_LOOKS.classic
  );
}

const hadPreviousInstall = (): boolean => {
  try {
    // zustand only writes a key after a change, so any one of these proves 0.8.x ran here.
    return ["ytm-settings", "ytm-whats-new", "ytm-playback", "ytm-layout"].some(
      (k) => localStorage.getItem(k) !== null,
    );
  } catch {
    return true;
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      activeId: initialLookFor(hadPreviousInstall()),
      layout: "sidebar",
      custom: [],
      pickerSeen: false,
      setActive: (id) => set({ activeId: id }),
      saveCustom: (look) => {
        const id = look.id.startsWith("custom-")
          ? look.id
          : `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({
          custom: s.custom.some((l) => l.id === id)
            ? s.custom.map((l) => (l.id === id ? { ...look, id } : l))
            : [...s.custom, { ...look, id }],
        }));
        return id;
      },
      renameCustom: (id, name) =>
        set((s) => ({
          custom: s.custom.map((l) => (l.id === id ? { ...l, name } : l)),
        })),
      deleteCustom: (id) =>
        set((s) => ({
          custom: s.custom.filter((l) => l.id !== id),
          activeId:
            s.activeId === id
              ? (s.custom.find((l) => l.id === id)?.base ?? CLASSIC_ID)
              : s.activeId,
        })),
      markPickerSeen: () => set({ pickerSeen: true }),
    }),
    { name: "ytm-looks" },
  ),
);

if (typeof window !== "undefined") {
  // Persist the first-run choice now: the floating window may start after
  // ytm-settings exists and would otherwise decide "had an install" itself.
  try {
    if (localStorage.getItem("ytm-looks") === null) {
      useThemeStore.setState({});
    }
  } catch {
    // Best effort only.
  }
  // Main and floating windows share ytm-looks; same pattern as ytm-settings.
  window.addEventListener("storage", (e) => {
    if (e.key === "ytm-looks") void useThemeStore.persist.rehydrate();
  });
}

export function useActiveLook(): Look {
  return useThemeStore(activeLook);
}
