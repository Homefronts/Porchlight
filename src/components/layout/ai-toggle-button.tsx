import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { aiDetectionMode, currentAiData, useAiDataStore } from "@/lib/ai/data";
import { useSettingsStore } from "@/lib/store/settings";
import { usePlaybackStore } from "@/lib/store/playback";
import { cn } from "@/lib/utils";

/** Copy agreed with the user; shown once on first opt-out and in Settings. */
export const AI_ACCURACY_TITLE = "AI filtering is pretty good, but not perfect.";
export const AI_ACCURACY_TEXT =
  "We detect AI music using community-run lists checked against Spotify. New or unlisted AI artists can still slip through. If you spot one, right-click the song and choose Mark artist as AI, and it'll be hidden from then on.";

const useNoticeOpen = create<{ open: boolean; setOpen: (v: boolean) => void }>()(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

/** Flip the AI music setting; the first opt-out explains the limits. */
export function setAiMusic(on: boolean): void {
  const s = useSettingsStore.getState();
  s.setAiMusic(on);
  if (!on && !s.aiNoticeSeen) {
    s.markAiNoticeSeen();
    useNoticeOpen.getState().setOpen(true);
  }
}

export function useAiDetectionMode() {
  const data = useAiDataStore((s) => s.data);
  void data;
  return aiDetectionMode(currentAiData(), Date.now());
}

export function AiToggleButton({ className }: { className?: string }) {
  const on = useSettingsStore((s) => s.aiMusic);
  const mode = useAiDetectionMode();
  const noticeReason = useAiDataStore((s) => s.noticeReason);
  const setNoticeReason = useAiDataStore((s) => s.setNoticeReason);
  const reason = mode.reduced ? mode.reason : null;

  // Announce reduced mode once per reason; clear it once healthy again.
  useEffect(() => {
    if (reason === noticeReason) return;
    if (mode.reduced) toast.warning(mode.message, { duration: 12_000 });
    setNoticeReason(reason);
  }, [reason, noticeReason, mode, setNoticeReason]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="AI music"
          aria-pressed={!on}
          onClick={() => setAiMusic(!on)}
          className={cn("relative w-auto px-1.5", className)}
        >
          <span
            className={cn(
              "text-[11px] font-bold tracking-wide",
              !on && "line-through decoration-2",
            )}
          >
            AI
          </span>
          {mode.reduced ? (
            <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-500" />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {on ? "AI music shown · click to hide" : "AI music hidden · click to show"}
        {mode.reduced ? " · detection in reduced mode" : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/** Mounted once (top bar); opened by the first opt-out. */
export function AiNoticeDialog() {
  const { open, setOpen } = useNoticeOpen();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{AI_ACCURACY_TITLE}</DialogTitle>
          <DialogDescription>{AI_ACCURACY_TEXT}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(false)}>OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const usePlayAnyway = create<{ run: (() => void) | null; set: (run: (() => void) | null) => void }>()(
  (set) => ({ run: null, set: (run) => set({ run }) }),
);

/**
 * Ask before playing a held-back AI song from the library. `start` begins
 * playback with the song current; it's then marked so `next()` and the
 * player don't treat it as held.
 */
export function askPlayAnyway(start: () => void): void {
  usePlayAnyway.getState().set(() => {
    start();
    usePlaybackStore.setState((s) => ({
      queue: s.queue.map((t, i) => (i === s.index ? { ...t, aiAllowed: true } : t)),
    }));
  });
}

/** Mounted once (top bar). */
export function PlayAnywayDialog() {
  const { run, set } = usePlayAnyway();
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && set(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>AI music is off. Play anyway?</DialogTitle>
          <DialogDescription>
            This song is marked as AI-generated. Playing it won't change your
            setting.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => set(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              run?.();
              set(null);
            }}
          >
            Play anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
