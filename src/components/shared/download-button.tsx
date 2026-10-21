import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconDownload,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  collectionProgress,
  removeCollectionDownload,
  useDownloadsStore,
  type CollectionKind,
  type DlTrack,
} from "@/lib/downloads";
import { downloadCollection, syncCollection } from "@/lib/downloads-sync";
import { cn } from "@/lib/utils";

/** Ring that fills as a collection downloads. */
function ProgressRing({ value }: { value: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2"
        className="stroke-current opacity-25"
      />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-current transition-[stroke-dashoffset]"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
      />
    </svg>
  );
}

/**
 * Spotify-style download toggle for a playlist / album / Liked Songs
 * header, styled like the header's Share button. Off → download all;
 * on → remove (files shared with other downloads stay). Opening the page
 * of a downloaded collection syncs it once.
 */
export function CollectionDownloadButton({
  kind,
  id,
}: {
  kind: CollectionKind;
  id: string;
}) {
  const progress = useDownloadsStore(
    useShallow((s) => collectionProgress(s.index, id)),
  );
  const downloaded = progress !== null;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (downloaded) void syncCollection(id);
    // Once per page visit; later toggles sync through their own calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const settled = progress ? progress.done + progress.failed : 0;
  const inFlight = !!progress && settled < progress.total;
  const label = busy
    ? "Preparing download"
    : !progress
      ? "Download"
      : inFlight
        ? `Downloading ${progress.done} of ${progress.total}`
        : progress.failed
          ? `Downloaded ${progress.done} of ${progress.total} songs. Click to remove`
          : "Downloaded. Click to remove";

  const toggle = async () => {
    setBusy(true);
    try {
      if (downloaded) await removeCollectionDownload(id);
      else await downloadCollection(kind, id);
    } catch (e) {
      toast.error(`Download failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          aria-pressed={downloaded}
          disabled={busy}
          onClick={() => void toggle()}
          className={cn(downloaded && !inFlight && "text-brand")}
        >
          {inFlight ? (
            <ProgressRing value={settled / progress.total} />
          ) : downloaded ? (
            <IconCircleCheckFilled />
          ) : (
            <IconDownload className={cn(busy && "animate-pulse")} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Per-row download state: check when saved, yellow ⚠ with the reason when it failed. */
export function TrackDownloadStatus({ videoId }: { videoId: string }) {
  const track = useDownloadsStore(
    (s): DlTrack | undefined => s.index.tracks[videoId],
  );
  if (!track) return null;
  if (track.state === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={`Download failed: ${track.error ?? "unknown error"}`}
            className="inline-flex shrink-0"
          >
            <IconAlertTriangleFilled className="size-3.5 text-yellow-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Couldn't download{track.error ? `: ${track.error}` : ""}. Will retry
          on the next sync.
        </TooltipContent>
      </Tooltip>
    );
  }
  return track.state === "done" ? (
    <IconCircleCheckFilled
      aria-label="Downloaded"
      className="size-3.5 shrink-0 text-brand"
    />
  ) : (
    <IconDownload
      aria-label="Waiting to download"
      className="size-3.5 shrink-0 animate-pulse text-muted-foreground"
    />
  );
}
