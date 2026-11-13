import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shouldShowConsent } from "@/lib/consent-gate";
import { useLyricsSettings } from "@/lib/store/lyrics-settings";
import { useWhatsNewStore } from "@/lib/store/whats-new";
import { useThemeStore } from "@/lib/theme/store";
import { useT } from "@/lib/i18n";

/** Only Accept and Decline close this: no outside click, Esc or close button. */
export function ChineseSourcesConsent() {
  const t = useT();
  const consent = useLyricsSettings((s) => s.chineseConsent);
  const answer = useLyricsSettings((s) => s.answerConsent);
  const whatsNewOpen = useWhatsNewStore((s) => s.open);
  const whatsNewChecked = useWhatsNewStore((s) => s.checked);
  const pickerSeen = useThemeStore((s) => s.pickerSeen);
  const open = shouldShowConsent({ consent, pickerSeen, whatsNewOpen, whatsNewChecked, makeItYoursOpen: !pickerSeen });
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("shell.consent.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("shell.consent.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{t("shell.consent.p1")}</p>
          <p>{t("shell.consent.p2")}</p>
          <p>{t("shell.consent.p3")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>{t("shell.consent.decline")}</Button>
          <Button onClick={() => answer(true)}>{t("shell.consent.accept")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
