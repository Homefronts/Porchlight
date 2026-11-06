import { useEffect, useState } from "react";
import { IconMoonFilled } from "@tabler/icons-react";
import { cancelSleepTimer, useSleepTimer } from "@/lib/store/sleep-timer";
import { usePlaybackSettings } from "@/lib/store/playback-settings";

const CHIP =
  "flex h-7 items-center gap-1 rounded-md px-2 font-meta text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function minutesLeft(endsAt: number, now: number): number {
  return Math.max(1, Math.ceil((endsAt - now) / 60_000));
}

/** Title-bar reminders of a running sleep timer and a changed speed. A click undoes each. */
export function PlaybackBadges() {
  const { endsAt, endOfSong } = useSleepTimer();
  const speed = usePlaybackSettings((s) => s.playbackSpeed);
  const setSpeed = usePlaybackSettings((s) => s.setPlaybackSpeed);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [endsAt]);

  const sleeping = endsAt !== null || endOfSong;
  if (!sleeping && speed === 1) return null;
  const sleepLabel = endOfSong ? "end of song" : `${minutesLeft(endsAt!, now)} min`;
  return (
    <div className="flex items-center gap-1 me-1">
      {sleeping && (
        <button
          type="button"
          className={CHIP}
          onClick={cancelSleepTimer}
          aria-label={`Sleep timer, ${sleepLabel}. Click to cancel`}
          title={`Sleep timer: ${sleepLabel}. Click to cancel`}
        >
          <IconMoonFilled className="size-3.5" />
          {sleepLabel}
        </button>
      )}
      {speed !== 1 && (
        <button
          type="button"
          className={CHIP}
          onClick={() => setSpeed(1)}
          aria-label={`Playing at ${speed}x. Click for normal speed`}
          title={`Playing at ${speed}x. Click for normal speed`}
        >
          {speed}x
        </button>
      )}
    </div>
  );
}
