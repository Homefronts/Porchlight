import { useCallback } from "react";
import { useSettingsStore } from "@/lib/store/settings";
import { currentAiIndex, useAiIndex } from "./data";
import { classifyArtists, type AiClass } from "./match";
import { filterAiItems } from "./filter";
import { useAiOverridesStore } from "./overrides";

type HasArtists = { artists?: { id?: string; name: string }[] };

export function useAiClass(item: HasArtists): AiClass {
  const idx = useAiIndex();
  const overrides = useAiOverridesStore((s) => s.byChannel);
  return classifyArtists(item.artists, idx, overrides);
}

export function aiClassNow(item: HasArtists): AiClass {
  return classifyArtists(item.artists, currentAiIndex(), useAiOverridesStore.getState().byChannel);
}

/** Confirmed AI while the user has AI music switched off. */
export function isAiBlocked(item: HasArtists): boolean {
  return !useSettingsStore.getState().aiMusic && aiClassNow(item) === "ai";
}

/** Hook form of `isAiBlocked`, re-rendering on any input change. */
export function useAiBlocked(item: HasArtists): boolean {
  const on = useSettingsStore((s) => s.aiMusic);
  return !on && useAiClass(item) === "ai";
}

/** `filterAiItems` bound to the current data, overrides and switch. */
export function useAiFilter(): <T extends Parameters<typeof filterAiItems>[0][number]>(items: T[]) => T[] {
  const idx = useAiIndex();
  const overrides = useAiOverridesStore((s) => s.byChannel);
  const hiding = !useSettingsStore((s) => s.aiMusic);
  return useCallback((items) => filterAiItems(items, idx, overrides, hiding), [idx, overrides, hiding]);
}
