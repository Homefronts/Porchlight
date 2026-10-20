import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { EntityHeader } from "@/components/shared/entity-header";
import { CollectionDownloadButton } from "@/components/shared/download-button";
import { TrackList } from "@/components/shared/track-list";
import { useDownloadsStore, type DlCollection } from "@/lib/downloads";
import {
  collectionThumbs,
  dlTrackToShelfItem,
  useCoverBase,
} from "@/lib/downloads-view";
import { usePlaybackStore } from "@/lib/store/playback";

export const Route = createFileRoute("/downloads_/$id")({
  component: DownloadedCollectionPage,
});

/** Offline view of one downloaded collection, straight from the index. */
function DownloadedCollectionPage() {
  const { id } = Route.useParams();
  const collection = useDownloadsStore(
    (s): DlCollection | undefined => s.index.collections[id],
  );
  const tracksById = useDownloadsStore((s) => s.index.tracks);
  const base = useCoverBase();

  const tracks = useMemo(
    () =>
      (collection?.trackIds ?? []).flatMap((tid) => {
        const t = tracksById[tid];
        return t ? [dlTrackToShelfItem(t, base)] : [];
      }),
    [collection, tracksById, base],
  );
  // Play / Shuffle only queue what's actually on disk.
  const playable = useMemo(
    () => tracks.filter((t) => tracksById[t.id]?.state === "done"),
    [tracks, tracksById],
  );

  if (!collection) {
    return (
      <p className="px-6 pt-6 text-sm text-muted-foreground">
        This download was removed.
      </p>
    );
  }

  const play = (shuffle: boolean) => {
    if (playable.length === 0) return;
    const start = shuffle ? Math.floor(Math.random() * playable.length) : 0;
    usePlaybackStore.getState().playShelfItems(playable, start);
    usePlaybackStore.getState().setShuffle(shuffle);
  };

  return (
    <div className="flex flex-col gap-4 px-6 pb-6">
      <EntityHeader
        title={collection.title}
        subtitle={collection.subtitle ?? undefined}
        thumbnails={collectionThumbs(collection, base)}
        onPlay={() => play(false)}
        onShuffle={() => play(true)}
        actions={
          <CollectionDownloadButton kind={collection.kind} id={collection.id} />
        }
      />
      <TrackList tracks={tracks} />
    </div>
  );
}
