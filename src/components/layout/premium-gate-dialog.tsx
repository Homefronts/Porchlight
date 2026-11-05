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
            <DialogTitle>Connect to the internet to keep using downloads</DialogTitle>
            <DialogDescription>
              Porchlight checks your Music Premium subscription at least once
              every 30 days. Go online for a moment and your downloads will
              play again.
            </DialogDescription>
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
              ? "Sign in to play music"
              : "YouTube Music Premium recommended"}
          </DialogTitle>
          <DialogDescription>
            {checking
              ? "Checking your YouTube Music subscription…"
              : signedOut
                ? "Porchlight plays music through your YouTube Music account. Sign in with an account that has an active Music Premium subscription."
                : "Your account doesn't have an active Music Premium subscription, which YouTube requires for ad-free playback."}
          </DialogDescription>
        </DialogHeader>

        {!checking && (
          <>
            <div className="flex gap-3 rounded-lg border border-border/60 bg-surface p-3">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Free YouTube Music is supported by ads. YouTube's Terms of
                Service require those ads to play, and Porchlight has no way to
                show them, so YouTube limits ad-free playback to Premium
                accounts.{" "}
                <span className="font-medium text-foreground">
                  Porchlight itself stays completely free and open source, and
                  always will be.
                </span>{" "}
                You can keep listening for free, with ads, at
                music.youtube.com.
              </p>
            </div>
            {offerFree && (
              <div className="grid gap-3 rounded-lg border border-border/60 p-3 text-xs leading-relaxed text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Play without Premium (experimental).</span>{" "}
                  We don't recommend this. It has no downloads, it may stop
                  working at any time, and YouTube could limit your account. You
                  choose to use it, and you're responsible for that choice.
                  Porchlight and its contributors accept no responsibility for
                  how you use it.
                </p>
                <label className="flex items-center gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  I understand and accept this
                </label>
                <Button variant="outline" size="sm" className="justify-self-start" disabled={!accepted} onClick={playWithoutPremium}>
                  Play without Premium
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void openUrl(YTM_URL)}>
                Listen in browser
              </Button>
              {signedOut ? (
                <Button
                  onClick={() => {
                    invoke("start_login").catch((e) =>
                      toast.error(String(e)),
                    );
                  }}
                >
                  Sign in
                </Button>
              ) : (
                <Button onClick={() => void openUrl(PREMIUM_URL)}>
                  Get Music Premium
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
