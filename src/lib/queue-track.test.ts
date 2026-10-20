import { describe, expect, it } from "vitest";
import { rowQueue } from "@/lib/queue-track";

const s = (id: string) => ({ kind: "song" as const, id, title: id, thumbnails: [] });

describe("rowQueue", () => {
  const tracks = [s("a"), s("b"), s("c"), s("d")];
  const ok = (t: { id: string }) => t.id !== "b";

  it("queues only playable rows, starting at the clicked one", () => {
    const r = rowQueue(tracks, 2, ok);
    expect(r?.queue.map((t) => t.id)).toEqual(["a", "c", "d"]);
    expect(r?.start).toBe(1);
  });

  it("refuses an unplayable row", () => {
    expect(rowQueue(tracks, 1, ok)).toBeNull();
  });

  it("keeps everything without a filter", () => {
    expect(rowQueue(tracks, 1)).toEqual({ queue: tracks, start: 1 });
  });
});
