import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { InfoIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePremiumGateDialog } from "@/lib/store/premium-gate";
import { useFreePlaybackStore, usePremiumStore } from "@/lib/store/premium";
import { useDownloadsStore } from "@/lib/downloads";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { authLoggedInQuery } from "@/lib/store/auth-queries";
import { useT } from "@/lib/i18n";

const PREMIUM_URL = "https://music.youtube.com/music_premium";
const YTM_URL = "https://music.youtube.com";

/**
 * Shown when a signed-out / Free user tries to start playback (the
 * audio engine calls `openPremiumGate()` instead of resolving a
 * stream). Content tracks the account state reactively: a "checking"
 * placeholder while the Premium probe is still in flight, then the
 * sign-in or upgrade message. It closes itself the moment Premium is
 * confirmed (e.g. right after signing in), so a paying user who
 * clicked play during the launch-time probe never reads a false
 * upsell.
 */
export function PremiumGateDialog() {
  const t = useT();
  const open = usePremiumGateDialog((s) => s.open);
  const setOpen = usePremiumGateDialog((s) => s.setOpen);
  const status = usePremiumStore((s) => s.status);
  const premiumOk = status === "premium";

  // Same key as usePremiumStatusSync, so it's served from the query
  // cache with no extra invoke round-trip in the common case.
  const loggedIn = useQuery({ ...authLoggedInQuery, enabled: open });

  // Premium confirmed while the dialog is up: nothing to explain.
  useEffect(() => {
    if (open && premiumOk) setOpen(false);
  }, [open, premiumOk, setOpen]);

  // A downloaded track only reaches the gate once the 30-day offline
  // grant has run out (or Premium lapsed): ask for a check-in, not an upsell.
  const currentId = usePlaybackStore((s) => currentTrack(s)?.videoId);
  const downloaded = useDownloadsStore(
    (s) => !!currentId && s.index.tracks[currentId]?.state === "done",
  );
  const needsCheckIn = downloaded && status !== "free";

  const signedOut = loggedIn.data === false;
  const checking = !needsCheckIn && !signedOut && status === null;
  const offerFree = status === "free" && !downloaded;
  const [accepted, setAccepted] = useState(false);
  const playWithoutPremium = () => {
    useFreePlaybackStore.setState({ enabled: true });
    setOpen(false);
    if (currentId) usePlaybackStore.getState().setPlaying(true);
  };

  if (needsCheckIn) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shell.premiumGate.checkInTitle")}</DialogTitle>
            <DialogDescription>{t("shell.premiumGate.checkInText")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {signedOut
              ? t("shell.premiumGate.signInTitle")
              : t("shell.premiumGate.recommendedTitle")}
          </DialogTitle>
          <DialogDescription>
            {checking
              ? t("shell.premiumGate.checking")
              : signedOut
                ? t("shell.premiumGate.signedOutText")
                : t("shell.premiumGate.noPremiumText")}
          </DialogDescription>
        </DialogHeader>

        {!checking && (
          <>
            <div className="flex gap-3 rounded-lg border border-border/60 bg-surface p-3">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("shell.premiumGate.adsNote1")}{" "}
                <span className="font-medium text-foreground">
                  {t("shell.premiumGate.adsNote2")}
                </span>{" "}
                {t("shell.premiumGate.adsNote3")}
              </p>
            </div>
            {offerFree && (
              <div className="grid gap-3 rounded-lg border border-border/60 p-3 text-xs leading-relaxed text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">{t("shell.premiumGate.experimentalTitle")}</span>{" "}
                  {t("shell.premiumGate.experimentalText")}
                </p>
                <label className="flex items-center gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  {t("shell.premiumGate.accept")}
                </label>
                <Button variant="outline" size="sm" className="justify-self-start" disabled={!accepted} onClick={playWithoutPremium}>
                  {t("shell.premiumGate.playWithout")}
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void openUrl(YTM_URL)}>
                {t("shell.premiumGate.listenInBrowser")}
              </Button>
              {signedOut ? (
                <Button
                  onClick={() => {
                    invoke("start_login").catch((e) =>
                      toast.error(String(e)),
                    );
                  }}
                >
                  {t("shell.premiumGate.signIn")}
                </Button>
              ) : (
                <Button onClick={() => void openUrl(PREMIUM_URL)}>
                  {t("shell.premiumGate.getPremium")}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
