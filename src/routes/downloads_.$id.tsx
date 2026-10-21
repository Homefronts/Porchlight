import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EntityHeader } from "@/components/shared/entity-header";
import { CollectionDownloadButton } from "@/components/shared/download-button";
import { TrackList } from "@/components/shared/track-list";
import { useDownloadsStore, type DlCollection } from "@/lib/downloads";
import {
  collectionThumbs,
  dlTrackToShelfItem,
  toDownloadedQueueItem,
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
    () => tracks.flatMap((t) => toDownloadedQueueItem(t) ?? []),
    // tracksById: re-derive as downloads finish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, tracksById],
  );

  // Albums store their artists on each track (see fetchCollectionInput);
  // link them like the online album page does.
  const albumArtists =
    collection?.kind === "album"
      ? (tracksById[collection.trackIds[0]]?.meta.artists ?? []).filter(
          (a) => a.id,
        )
      : [];

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
        subtitle={
          albumArtists.length ? (
            <span className="inline-flex flex-wrap gap-1">
              {albumArtists.map((a, i) => (
                <span key={a.id}>
                  <Link
                    to="/artist/$id"
                    params={{ id: a.id! }}
                    className="hover:text-foreground hover:underline"
                  >
                    {a.name}
                  </Link>
                  {i < albumArtists.length - 1 ? "," : ""}
                </span>
              ))}
            </span>
          ) : (
            (collection.subtitle ?? undefined)
          )
        }
        thumbnails={collectionThumbs(collection, base)}
        onPlay={() => play(false)}
        onShuffle={() => play(true)}
        actions={
          <CollectionDownloadButton kind={collection.kind} id={collection.id} />
        }
      />
      <TrackList tracks={tracks} toQueue={toDownloadedQueueItem} aiMode="hold" />
    </div>
  );
}
