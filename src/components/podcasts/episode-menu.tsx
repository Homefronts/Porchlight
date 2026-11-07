import type { ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { IconCircleCheck, IconCircleDashed, IconMicrophone } from "@tabler/icons-react";
import { episodeStatus, useEpisodesStore } from "@/lib/store/episodes";
import type { QueueTrack } from "@/lib/store/playback";

/**
 * Episode-only menu entries. `Item` is the menu primitive of the host menu
 * (context or dropdown). Download is already in the shared track menu.
 */
export function EpisodeMenuItems({ track, Item }: { track: QueueTrack; Item: ComponentType<any> }) {
  const played = useEpisodesStore((s) => episodeStatus(s.byId[track.videoId]) === "played");
  const navigate = useNavigate();
  const showId = track.episode?.showId;
  return (
    <>
      {played ? (
    <Item onSelect={() => useEpisodesStore.getState().markUnplayed(track.videoId)}>
      <IconCircleDashed />
      Mark as unplayed
    </Item>
  ) : (
    <Item onSelect={() => useEpisodesStore.getState().markPlayed(track)}>
      <IconCircleCheck />
      Mark as played
    </Item>
      )}
      {showId ? (
        <Item onSelect={() => void navigate({ to: "/podcast/$id", params: { id: showId } })}>
          <IconMicrophone />
          Open show
        </Item>
      ) : null}
    </>
  );
}
