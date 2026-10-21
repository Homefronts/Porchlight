import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeLocalStorage } from "@/lib/store/safe-storage";
import type { AiOverrides } from "./match";

/**
 * The user's own "Mark artist as AI" / "Not AI" calls, keyed by YouTube
 * channel id. They win over the community data and never expire.
 */
type State = {
  byChannel: AiOverrides;
  set: (channelId: string, v: "ai" | "not-ai" | null) => void;
};

export const useAiOverridesStore = create<State>()(
  persist(
    (set) => ({
      byChannel: {},
      set: (id, v) =>
        set((s) => {
          const byChannel = { ...s.byChannel };
          if (v) byChannel[id] = v;
          else delete byChannel[id];
          return { byChannel };
        }),
    }),
    { name: "ytubic-ai-overrides", storage: createJSONStorage(() => safeLocalStorage) },
  ),
);
