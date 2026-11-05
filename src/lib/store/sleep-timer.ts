import { create } from "zustand";
import { usePlaybackStore } from "@/lib/store/playback";

/** `endsAt`: when playback stops. `endOfSong`: stop when this song is over. */
export const useSleepTimer = create<{ endsAt: number | null; endOfSong: boolean }>(() => ({
  endsAt: null,
  endOfSong: false,
}));

let timer: ReturnType<typeof setTimeout> | undefined;

export function cancelSleepTimer(): void {
  clearTimeout(timer);
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

/** Stops when whichever song is playing reaches its end, so skipping just moves the stop along. */
export function sleepAfterThisSong(): void {
  cancelSleepTimer();
  useSleepTimer.setState({ endOfSong: true });
}

/** For the audio engine when a song ends: true once, if the timer was waiting for this. */
export function takeEndOfSongStop(): boolean {
  if (!useSleepTimer.getState().endOfSong) return false;
  cancelSleepTimer();
  return true;
}
