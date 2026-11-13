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
import {
  aiDetectionMode,
  currentAiData,
  reducedNoticeAction,
  useAiDataStore,
} from "@/lib/ai/data";
import { useSettingsStore } from "@/lib/store/settings";
import { allowHeldStart, usePlaybackStore } from "@/lib/store/playback";
import { cn } from "@/lib/utils";
import { t, useT } from "@/lib/i18n";

/** Copy agreed with the user; shown once on first opt-out and in Settings. */
export const aiAccuracyTitle = () => t("shell.ai.accuracyTitle");
export const aiAccuracyText = () => t("shell.ai.accuracyText");

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
  const t = useT();
  const on = useSettingsStore((s) => s.aiMusic);
  const mode = useAiDetectionMode();
  const noticeReason = useAiDataStore((s) => s.noticeReason);
  const setNoticeReason = useAiDataStore((s) => s.setNoticeReason);
  const reason = mode.reduced ? mode.reason : null;

  const synced = useAiDataStore((s) => s.synced);
  // Announce reduced mode once per reason; clear it once healthy again.
  useEffect(() => {
    const action = reducedNoticeAction({ reason, noticeReason, ready: synced, aiMusic: on });
    if (action === "announce" && mode.reduced) toast.warning(mode.message, { duration: 12_000 });
    if (action) setNoticeReason(reason);
  }, [reason, noticeReason, synced, on, mode, setNoticeReason]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("shell.ai.toggleLabel")}
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
            {t("shell.ai.badge")}
          </span>
          {mode.reduced ? (
            <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-500" />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {on ? t("shell.ai.shown") : t("shell.ai.hidden")}
        {mode.reduced ? t("shell.ai.reduced") : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/** Mounted once (top bar); opened by the first opt-out. */
export function AiNoticeDialog() {
  const t = useT();
  const { open, setOpen } = useNoticeOpen();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shell.ai.accuracyTitle")}</DialogTitle>
          <DialogDescription>{t("shell.ai.accuracyText")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(false)}>{t("common.ok")}</Button>
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
    allowHeldStart();
    start();
    allowHeldStart(false); // start() may not have gone through setQueue
    usePlaybackStore.setState((s) => ({
      queue: s.queue.map((t, i) => (i === s.index ? { ...t, aiAllowed: true } : t)),
    }));
  });
}

/** Mounted once (top bar). */
export function PlayAnywayDialog() {
  const t = useT();
  const { run, set } = usePlayAnyway();
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && set(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("shell.ai.playAnywayTitle")}</DialogTitle>
          <DialogDescription>{t("shell.ai.playAnywayText")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => set(null)}>
            {t("shell.ai.cancel")}
          </Button>
          <Button
            onClick={() => {
              run?.();
              set(null);
            }}
          >
            {t("shell.ai.playAnyway")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
