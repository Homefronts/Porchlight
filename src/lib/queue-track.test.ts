import { describe, expect, it } from "vitest";
import { rowQueue } from "@/lib/queue-track";

const s = (id: string) => ({ kind: "song" as const, id, title: id, thumbnails: [] });

describe("rowQueue", () => {
  const tracks = [s("a"), s("b"), s("c"), s("d")];
  // Offline views: "b" isn't downloaded; queued items swap in their real artwork.
  const toQueue = (t: { id: string }) =>
    t.id === "b" ? null : { ...s(t.id), thumbnails: [{ url: `https://img/${t.id}` }] };

  it("queues only playable rows, starting at the clicked one", () => {
    const r = rowQueue(tracks, 2, toQueue);
    expect(r?.queue.map((t) => t.id)).toEqual(["a", "c", "d"]);
    expect(r?.start).toBe(1);
  });

  it("queues the mapped items, not the display rows", () => {
    expect(rowQueue(tracks, 0, toQueue)?.queue[0].thumbnails[0].url).toBe("https://img/a");
  });

  it("refuses an unplayable row", () => {
    expect(rowQueue(tracks, 1, toQueue)).toBeNull();
  });

  it("keeps everything without a mapper", () => {
    expect(rowQueue(tracks, 1)).toEqual({ queue: tracks, start: 1 });
  });
});
