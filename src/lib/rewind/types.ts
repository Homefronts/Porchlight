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
  /** Different songs played (counted plays). */
  songs: number;
  /** Of those, never heard in an earlier rewind; left out when there is none. */
  newSongs?: number;
  topArtists: Ranked[];
  topSongs: Ranked[];
  topAlbums: Ranked[];
  /** Minutes per local hour of day, 24 buckets. */
  hours: number[];
  newArtists: Ranked[];
  /** Every artist heard this quarter, so later rewinds can tell who's new. */
  artistKeys: string[];
  /** Every song heard this quarter, so later rewinds can tell what's new. */
  songKeys?: string[];
  /** From Last.fm tags of the top artists; missing when none were found. */
  genres?: string[];
  /** Keyed by cover URL. */
  palette?: Record<string, Palette>;
};
