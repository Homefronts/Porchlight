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

/** Only Accept and Decline close this: no outside click, Esc or close button. */
export function ChineseSourcesConsent() {
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
          <DialogTitle>Word-by-word lyrics from Kugou and NetEase</DialogTitle>
          <DialogDescription className="sr-only">Choose whether Porchlight may contact Kugou and NetEase.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Porchlight can get word-by-word lyrics from Kugou and NetEase, two music services based in China.</p>
          <p>
            If you accept, for each song you play they receive its title, artist and length. Like any website, they
            also see your computer's IP address. They never get your name, accounts, cookies, logins or listening
            history.
          </p>
          <p>You can change this any time in Settings &gt; Lyrics.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>Decline</Button>
          <Button onClick={() => answer(true)}>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
