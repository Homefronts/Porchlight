import type { QuarterId } from "./quarter";

/** One listen, as stored on this computer. Nothing else is recorded. */
export type Play = {
  videoId: string;
  title: string;
  artists: { id?: string; name: string }[];
  album?: string;
  albumId?: string;
  thumb?: string;
  startedAt: number;
  playedSec: number;
  counted: boolean;
  aiAllowed?: true;
  source: "app" | "takeout";
};

export type Ranked = {
  key: string;
  name: string;
  plays: number;
  minutes: number;
  thumb?: string;
  /** Artists only: their most-played album in this quarter. */
  topAlbum?: { id?: string; name: string; thumb?: string };
};

export type Palette = { bg: [string, string, string]; accent: string };

/** A sealed quarter. Frozen once built. */
export type Rewind = {
  quarter: QuarterId;
  builtAt: number;
  minutes: number;
  plays: number;
  topArtists: Ranked[];
  topSongs: Ranked[];
  topAlbums: Ranked[];
  /** Minutes per local hour of day, 24 buckets. */
  hours: number[];
  newArtists: Ranked[];
  /** Keyed by cover URL. */
  palette?: Record<string, Palette>;
};
