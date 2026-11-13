import { useEffect, useState } from "react";
import { IconMoonFilled } from "@tabler/icons-react";
import { cancelSleepTimer, useSleepTimer } from "@/lib/store/sleep-timer";
import { usePlaybackSettings } from "@/lib/store/playback-settings";
import { isEpisode, usePlaybackStore } from "@/lib/store/playback";
import { useT } from "@/lib/i18n";

const CHIP =
  "flex h-7 items-center gap-1 rounded-md px-2 font-meta text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function minutesLeft(endsAt: number, now: number): number {
  return Math.max(1, Math.ceil((endsAt - now) / 60_000));
}

/** Title-bar reminders of a running sleep timer and a changed speed. A click undoes each. */
export function PlaybackBadges() {
  const t = useT();
  const { endsAt, endOfSong } = useSleepTimer();
  const speed = usePlaybackSettings((s) => s.playbackSpeed);
  const setSpeed = usePlaybackSettings((s) => s.setPlaybackSpeed);
  const sponsors = usePlaybackSettings((s) => s.skipSponsors);
  const setSponsors = usePlaybackSettings((s) => s.setSkipSponsors);
  const episode = usePlaybackStore((s) => isEpisode(s.queue[s.index]));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [endsAt]);

  const sleeping = endsAt !== null || endOfSong;
  if (!sleeping && speed === 1 && !episode) return null;
  const sleepLabel = endOfSong ? t("player.badges.endOfSong") : t("player.badges.minutes", { count: minutesLeft(endsAt!, now) });
  return (
    <div className="flex items-center gap-1 me-1">
      {sleeping && (
        <button
          type="button"
          className={CHIP}
          onClick={cancelSleepTimer}
          aria-label={t("player.badges.sleepAria", { label: sleepLabel })}
          title={t("player.badges.sleepTitle", { label: sleepLabel })}
        >
          <IconMoonFilled className="size-3.5" />
          {sleepLabel}
        </button>
      )}
      {episode && (
        <button
          type="button"
          className={`${CHIP} ${sponsors ? "bg-accent text-foreground" : ""}`}
          aria-pressed={sponsors}
          onClick={() => setSponsors(!sponsors)}
          title={t("player.badges.skipSponsors")}
        >
          {t("player.badges.skipSponsors")}
        </button>
      )}
      {speed !== 1 && (
        <button
          type="button"
          className={CHIP}
          onClick={() => setSpeed(1)}
          aria-label={t("player.badges.speed", { speed })}
          title={t("player.badges.speed", { speed })}
        >
          {speed}x
        </button>
      )}
    </div>
  );
}
