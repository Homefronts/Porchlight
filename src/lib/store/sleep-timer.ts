import { create } from "zustand";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";

/** `endsAt`: when playback stops. `endOfSong`: stop when this song is over. */
export const useSleepTimer = create<{ endsAt: number | null; endOfSong: boolean }>(() => ({
  endsAt: null,
  endOfSong: false,
}));

let timer: ReturnType<typeof setTimeout> | undefined;
let unwatch: (() => void) | undefined;

export function cancelSleepTimer(): void {
  clearTimeout(timer);
  unwatch?.();
  unwatch = undefined;
  useSleepTimer.setState({ endsAt: null, endOfSong: false });
}

function stop(): void {
  cancelSleepTimer();
  usePlaybackStore.getState().setPlaying(false);
}

export function sleepAfterMinutes(minutes: number): void {
  cancelSleepTimer();
  const ms = minutes * 60_000;
  useSleepTimer.setState({ endsAt: Date.now() + ms });
  timer = setTimeout(stop, ms);
}

// shortcut: a manual skip also stops, and repeat-one never does; track the song's real end if that's reported.
export function sleepAfterThisSong(): void {
  cancelSleepTimer();
  useSleepTimer.setState({ endOfSong: true });
  const id = currentTrack(usePlaybackStore.getState())?.videoId;
  unwatch = usePlaybackStore.subscribe((s) => {
    if (currentTrack(s)?.videoId !== id) stop();
  });
}
