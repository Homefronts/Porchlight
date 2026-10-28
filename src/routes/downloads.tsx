import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { Thumbnail } from "@/components/shared/thumbnail";
import { TrackList } from "@/components/shared/track-list";
import {
  PageTitle,
  recordTitleClass,
  useLookFamily,
} from "@/components/theme/look-type";
import { SectionLabel } from "@/components/theme/section-label";
import { cn } from "@/lib/utils";
import {
  SINGLE_REF,
  collectionProgress,
  useDownloadsStore,
  type DlCollection,
} from "@/lib/downloads";
import {
  collectionThumbs,
  dlTrackToShelfItem,
  toDownloadedQueueItem,
  useCoverBase,
} from "@/lib/downloads-view";

export const Route = createFileRoute("/downloads")({
  component: DownloadsPage,
});

const KIND_ORDER = { liked: 0, playlist: 1, album: 2 } as const;

/** Everything here renders from the local downloads index: no network. */
function DownloadsPage() {
  const family = useLookFamily();
  const index = useDownloadsStore((s) => s.index);
  const base = useCoverBase();

  const collections = useMemo(
    () =>
      Object.values(index.collections).sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.title.localeCompare(b.title),
      ),
    [index.collections],
  );
  const singles = useMemo(
    () =>
      Object.values(index.tracks)
        .filter((t) => t.refs.includes(SINGLE_REF))
        .map((t) => dlTrackToShelfItem(t, base)),
    [index.tracks, base],
  );

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-3">
      <PageTitle>Downloads</PageTitle>
      {collections.length === 0 && singles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing downloaded yet. Use the download button on any playlist or
          album.
        </p>
      ) : null}
      {collections.length > 0 ? (
        <div className="grid w-full gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] [&>*]:max-w-[20rem]">
          {collections.map((c) => (
            <CollectionCard key={c.id} c={c} base={base} />
          ))}
        </div>
      ) : null}
      {singles.length > 0 ? (
        <section className="flex flex-col gap-2">
          {family === "classic" ? (
            <h2 className="text-xl font-semibold">Songs</h2>
          ) : (
            <SectionLabel>Songs</SectionLabel>
          )}
          <TrackList tracks={singles} toQueue={toDownloadedQueueItem} aiMode="hold" />
        </section>
      ) : null}
    </div>
  );
}

function CollectionCard({ c, base }: { c: DlCollection; base?: string }) {
  const family = useLookFamily();
  const progress = useDownloadsStore(
    useShallow((s) => collectionProgress(s.index, c.id)),
  );
  const count = progress
    ? progress.done === progress.total
      ? `${progress.total} songs`
      : `${progress.done} of ${progress.total} songs`
    : "";
  return (
    <Link
      to="/downloads/$id"
      params={{ id: c.id }}
      className="flex flex-col gap-2 rounded-lg p-2 transition-colors hover:bg-accent/50"
    >
      <Thumbnail
        thumbnails={collectionThumbs(c, base)}
        alt={c.title}
        className="look-cover-shadow aspect-square size-full rounded-[var(--radius-cover,var(--radius-lg))]"
        highRes
      />
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-medium", recordTitleClass(family))}>
          {c.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[c.subtitle, count].filter(Boolean).join(" • ")}
        </p>
      </div>
    </Link>
  );
}
