import { toast } from "sonner";
import { fetchRadioStation } from "@/lib/innertube/radio";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";

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
    const now = usePlaybackStore.getState();
    // The track changed while the request was in flight — drop it.
    if (currentTrack(now)?.videoId !== seed) return;
    now.setRadio(
      station.tracks,
      station.chips,
      0,
      station.continuationToken,
    );
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
    const now = usePlaybackStore.getState();
    if (!now.radio || currentTrack(now)?.videoId !== seed) return;
    now.setRadio(
      station.tracks,
      now.radio.chips,
      index,
      station.continuationToken,
    );
  } catch (e) {
    toast.error(`Couldn't load "${chip.label}": ${String(e)}`);
  }
}
