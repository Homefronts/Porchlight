import { expect, it } from "vitest";
import { episodeTag, firstUnplayed, spokenLength } from "./episode-view";
import type { EpisodeState } from "@/lib/store/episodes";
import type { QueueTrack } from "@/lib/store/playback";

const st = (o: Partial<EpisodeState>): EpisodeState => ({ position: 0, played: false, updatedAt: 0, track: {} as QueueTrack, ...o });

it("formats lengths", () => {
  expect(spokenLength(7440)).toBe("2 HR 4 MIN");
  expect(spokenLength(2880)).toBe("48 MIN");
  expect(spokenLength(3600)).toBe("1 HR");
  expect(spokenLength(undefined)).toBe("");
});

it("tags new, started and played", () => {
  expect(episodeTag(undefined, 2880)).toEqual({ status: "new", label: "48 MIN", chip: "NEW" });
  expect(episodeTag(st({ position: 600 }), undefined)).toEqual({ status: "started", label: "" });
  expect(episodeTag(st({ position: 600, duration: 3600 }), 3600)).toEqual({ status: "started", label: "50 MIN LEFT" });
  expect(episodeTag(st({ played: true }), 3600)).toEqual({ status: "played", label: "", chip: "✓ PLAYED" });
});

it("finds the first unplayed episode in shown order", () => {
  const ids = ["a", "b", "c"];
  const byId = { a: st({ played: true }), b: st({ position: 100 }) };
  expect(firstUnplayed(ids, byId)).toBe(1);
  expect(firstUnplayed(ids, { a: byId.a, b: st({ played: true }), c: st({ played: true }) })).toBe(0);
});
