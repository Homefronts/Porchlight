import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type PremiumStatus } from "@/lib/innertube/account";
import { authLoggedInQuery, premiumStatusQuery } from "@/lib/store/auth-queries";
import { useShallow } from "zustand/react/shallow";
import { useDownloadsStore } from "@/lib/downloads";
import { safeLocalStorage } from "./safe-storage";

type State = {
  /**
   * Last known Premium status from auto-detection. `null` while we
   * haven't checked yet *or* when the user is not signed in.
   */
  status: PremiumStatus;
  setStatus: (status: PremiumStatus) => void;
};

/**
 * Premium-status state shared across React and non-React code. The
 * `audio-engine` + `stream.ts` modules consult this synchronously via
 * `usePremiumStore.getState()` to decide whether playback is allowed
 * and whether to fire prefetches.
 *
 * The actual fetching/refresh is owned by the `usePremiumStatusSync`
 * hook mounted in AppShell. Keeping the store dumb means anyone with a
 * cached value (e.g. a freshly opened floating-player window) starts
 * from the conservative `null` and only flips to "premium" once the
 * authoritative check completes.
 *
 * Nothing is persisted: `status` is rederived on every launch so a
 * Premium → Free downgrade outside the app takes effect on the next
 * start. There is no "I have Premium" override; Free accounts opt in
 * through useFreePlaybackStore instead. Misdetection is covered by
 * fetchPremiumStatus failing open to "premium" when its patterns
 * don't match, plus the Re-check button on the Storage tab. (An
 * override used to exist and was persisted under the "ytm-premium"
 * localStorage key; that key is now simply ignored.)
 */
export const usePremiumStore = create<State>()((set) => ({
  status: null,
  setStatus: (status) => {
    set({ status });
    // Only definitive answers move the offline grant; null (signed out,
    // still checking, offline) leaves it alone.
    if (status === "premium") {
      useOfflineGrantStore.setState({
        premiumConfirmedAt: Date.now(),
        premiumLapsed: false,
      });
    } else if (status === "free") {
      useOfflineGrantStore.setState({ premiumLapsed: true });
    }
  },
}));

/**
 * The one persisted piece of Premium state: when Premium was last
 * confirmed. It lets downloaded tracks play offline (where the probe
 * can't run) for OFFLINE_GRANT_MS. It never unlocks streaming, and a
 * confirmed downgrade locks downloads until Premium is confirmed again.
 */
type OfflineGrant = { premiumConfirmedAt: number | null; premiumLapsed: boolean };

export const useOfflineGrantStore = create<OfflineGrant>()(
  persist((): OfflineGrant => ({ premiumConfirmedAt: null, premiumLapsed: false }), {
    name: "ytubic-offline-grant",
    storage: createJSONStorage(() => safeLocalStorage),
  }),
);

/**
 * The experimental opt-in for Free accounts, accepted in the Premium dialog.
 * It unlocks streaming only: downloads and the persistent cache stay Premium
 * (isPremium() is unchanged, so streams stay ephemeral).
 */
export const useFreePlaybackStore = create<{ enabled: boolean }>()(
  persist((): { enabled: boolean } => ({ enabled: false }), {
    name: "porchlight-free-playback",
    storage: createJSONStorage(() => safeLocalStorage),
  }),
);

/** Only a confirmed Free account: signed-out and still-checking stay gated. */
export function freeStreamAllowed(status: PremiumStatus, enabled: boolean, downloaded: boolean): boolean {
  return status === "free" && enabled && !downloaded;
}

/** Downloads are Premium only. Unknown status (offline, signed out) isn't a refusal. */
export function useCanDownload(): boolean {
  return usePremiumStore((s) => s.status) !== "free";
}

export const OFFLINE_GRANT_MS = 30 * 24 * 60 * 60 * 1000;

export function downloadedPlaybackAllowed(
  now: number,
  s: {
    status: PremiumStatus;
    premiumConfirmedAt: number | null;
    premiumLapsed: boolean;
  },
): boolean {
  return (
    s.status === "premium" ||
    (!s.premiumLapsed &&
      s.premiumConfirmedAt !== null &&
      now - s.premiumConfirmedAt < OFFLINE_GRANT_MS)
  );
}

/**
 * Whether `videoId` may play right now: live Premium, or a downloaded
 * track within the offline grant. Reactive to all three stores.
 */
export function usePlaybackAllowed(videoId?: string): boolean {
  const status = usePremiumStore((s) => s.status);
  const grant = useOfflineGrantStore(
    useShallow((s) => ({
      premiumConfirmedAt: s.premiumConfirmedAt,
      premiumLapsed: s.premiumLapsed,
    })),
  );
  const downloaded = useDownloadsStore(
    (s) => !!videoId && s.index.tracks[videoId]?.state === "done",
  );
  const free = useFreePlaybackStore((s) => s.enabled);
  return (
    status === "premium" ||
    freeStreamAllowed(status, free, downloaded) ||
    (downloaded && downloadedPlaybackAllowed(Date.now(), { status, ...grant }))
  );
}

/** Non-React twin of usePlaybackAllowed (crossfade preload). */
export function playbackAllowed(videoId?: string): boolean {
  const status = usePremiumStore.getState().status;
  if (status === "premium") return true;
  if (!videoId) return false;
  const downloaded = useDownloadsStore.getState().index.tracks[videoId]?.state === "done";
  if (freeStreamAllowed(status, useFreePlaybackStore.getState().enabled, downloaded)) return true;
  if (!downloaded) return false;
  return downloadedPlaybackAllowed(Date.now(), {
    status,
    ...useOfflineGrantStore.getState(),
  });
}

/** Synchronous read for non-React callers (stream.ts, audio-engine). */
export function isPremium(): boolean {
  return usePremiumStore.getState().status === "premium";
}

/**
 * Mount once near the app root (AppShell). Watches the login state
 * and, when authenticated, fetches Premium status from YT Music, then
 * mirrors it into the Zustand store. Signed-out users get `null`
 * immediately so stream URLs flip to ephemeral mode without waiting on
 * a network round-trip.
 */
export function usePremiumStatusSync(): void {
  const loggedIn = useQuery(authLoggedInQuery);
  const premium = useQuery(premiumStatusQuery(loggedIn.data === true));

  useEffect(() => {
    if (loggedIn.data === false) {
      usePremiumStore.setState({ status: null });
      return;
    }
    if (premium.data === undefined) return;
    usePremiumStore.getState().setStatus(premium.data);
    // dataUpdatedAt: a refetch that re-confirms "premium" keeps the same
    // data reference, but must still restamp the offline grant.
  }, [loggedIn.data, premium.data, premium.dataUpdatedAt]);
}
