import {
  IconExternalLink,
  IconLayoutSidebarRightFilled,
} from "@tabler/icons-react";
import { COVER_RADIUS } from "@/components/layout/player-chrome";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Thumbnail } from "@/components/shared/thumbnail";
import { ArtworkOutline } from "@/components/shared/artwork-outline";
import { ArtistLinks } from "@/components/shared/artist-links";
import { useITunesCover } from "@/components/layout/player-bar";
import { recordTitleClass, useLookFamily } from "@/components/theme/look-type";
import { openFullscreen } from "@/lib/store/fullscreen";
import { useLayoutStore } from "@/lib/store/layout";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { cn } from "@/lib/utils";
import { toggleFloating } from "./floating";
import { useT } from "@/lib/i18n";

// The hairline keeps a panel apart from the ground when the look's own ground is black (Ink).
export const PANEL = "rounded-[var(--radius-window,12px)] border border-w110 bg-background";

/** The right panel: the playing record, big. */
export function NowPlayingPanel({ className }: { className?: string }) {
  const t = useT();
  const track = usePlaybackStore(currentTrack);
  const iTunesCover = useITunesCover(track);
  const family = useLookFamily();
  return (
    <aside
      aria-label={t("player.nowPlaying")}
      className={cn(
        "flex w-[270px] shrink-0 flex-col gap-3 overflow-y-auto p-4",
        PANEL,
        className,
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("player.nowPlaying")}
      </span>
      {track ? (
        <>
          <button
            type="button"
            aria-label={t("player.controls.openFullscreen")}
            onClick={openFullscreen}
            className="relative isolate aspect-square w-full shrink-0"
          >
            <Thumbnail
              thumbnails={track.thumbnails}
              alt={track.title}
              className={cn("size-full", COVER_RADIUS)}
              targetSize={512}
              highRes
              overrideHighRes={iTunesCover}
            />
            <ArtworkOutline className={COVER_RADIUS} />
          </button>
          <div className="flex min-w-0 flex-col gap-1">
            <span
              className={cn(
                "line-clamp-2 text-xl font-semibold leading-tight",
                recordTitleClass(family),
              )}
            >
              {track.title}
            </span>
            <ArtistLinks
              artists={track.artists}
              fallback={track.subtitle ?? ""}
              className={cn(
                "truncate text-sm text-muted-foreground",
                family === "liner" && "font-headline text-lg italic",
              )}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className={cn(
              "grid aspect-square w-full shrink-0 place-items-center border border-dashed border-border text-xs uppercase tracking-wider text-muted-foreground",
              COVER_RADIUS,
            )}
          >
            {t("player.nothingYet")}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xl font-semibold leading-tight text-muted-foreground">
              {t("player.nothingPlaying")}
            </span>
            <span
              className={cn(
                "text-sm text-muted-foreground",
                family === "liner" && "font-headline text-lg italic",
              )}
            >
              {t("player.pickRecord")}
            </span>
          </div>
        </>
      )}
    </aside>
  );
}

function BarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn(pressed && "text-brand")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Floating on or off; the bar stays put either way. */
export function PopOutButton({ hasTrack }: { hasTrack: boolean }) {
  const t = useT();
  const floating = useLayoutStore((s) => s.mode === "floating");
  return (
    <BarButton
      label={floating ? t("player.closeFloating") : t("player.popOut")}
      pressed={floating}
      disabled={!hasTrack && !floating}
      onClick={toggleFloating}
    >
      <IconExternalLink />
    </BarButton>
  );
}

/** Compact only: brings the folded Now playing panel out over the page. */
export function NowPlayingToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <BarButton label={t("player.nowPlaying")} pressed={open} onClick={onToggle}>
      <IconLayoutSidebarRightFilled />
    </BarButton>
  );
}
