import { toast } from "sonner";
import {
  fetchRadioStation,
  fetchWatchQueueContinuation,
  type RadioStation,
} from "@/lib/innertube/radio";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { isAiHidden } from "@/lib/ai/use-ai";
import { refillFiltered } from "@/lib/ai/filter";

/** The station minus confirmed AI (when AI music is off), refilled. */
function withoutAi(station: RadioStation, seed: string) {
  return refillFiltered(
    station.tracks,
    station.continuationToken,
    async (t) => {
      const p = await fetchWatchQueueContinuation(t);
      return { tracks: p.tracks, continuation: p.continuationToken };
    },
    (t) => t.id === seed || !isAiHidden(t),
  );
}

/**
 * Player radio button: start a mix seeded on what's playing, or end the
 * running one (the old "Up next" comes back, see `stopRadio`).
 */
export async function toggleRadioMix(): Promise<void> {
  const s = usePlaybackStore.getState();
  if (s.radio) return s.stopRadio();
  const seed = currentTrack(s)?.videoId;
  if (!seed) return;
  try {
    const station = await fetchRadioStation(seed);
    const mix = await withoutAi(station, seed);
    const now = usePlaybackStore.getState();
    // The track changed while the request was in flight — drop it.
    if (currentTrack(now)?.videoId !== seed) return;
    now.setRadio(mix.tracks, station.chips, 0, mix.continuation);
  } catch (e) {
    toast.error(`Couldn't start radio: ${String(e)}`);
  }
}

/** Reshape the running mix with one of its mood chips, seeded on the current track. */
export async function pickRadioChip(index: number): Promise<void> {
  const s = usePlaybackStore.getState();
  const chip = s.radio?.chips[index];
  const seed = currentTrack(s)?.videoId;
  if (!chip || !seed || s.radio?.chip === index) return;
  try {
    const station = await fetchRadioStation(seed, chip);
    const mix = await withoutAi(station, seed);
    const now = usePlaybackStore.getState();
    if (!now.radio || currentTrack(now)?.videoId !== seed) return;
    now.setRadio(mix.tracks, now.radio.chips, index, mix.continuation);
  } catch (e) {
    toast.error(`Couldn't load "${chip.label}": ${String(e)}`);
  }
}
