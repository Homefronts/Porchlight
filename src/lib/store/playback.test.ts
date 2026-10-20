import { beforeEach, describe, expect, it } from "vitest";
import type { PlaybackState, QueueTrack } from "@/lib/store/playback";

// The store decides at import time whether to wrap itself in
// zustand/persist (main window) or stay plain (floating mirror).
// Present ourselves as the floating window so construction skips
// persist + localStorage (which isn't available under the node test
// env). `next()` — the reducer under test — is identical in both
// variants, so this only sidesteps the storage plumbing.
// The Playback settings store (read by prev()) persists through
// localStorage regardless, so give it an in-memory one.
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "?floating-player" },
  // Stores sync across windows via "storage" events.
  addEventListener: () => {},
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

const { usePlaybackStore, persistedRadio } = await import("@/lib/store/playback");
const { usePlaybackSettings } = await import("@/lib/store/playback-settings");

function track(videoId: string): QueueTrack {
  return { videoId, title: videoId, thumbnails: [] };
}

/** Reset to a known "mid-playback" baseline, then apply the overrides. */
function setup(partial: Partial<PlaybackState>): void {
  usePlaybackStore.setState({
    queue: [],
    index: -1,
    repeat: "off",
    shuffle: false,
    playing: true,
    status: "ready",
    streamUrl: "blob:prev",
    position: 42,
    pendingSeek: undefined,
    ...partial,
  });
}

describe("clearQueue", () => {
  beforeEach(() => setup({}));

  it("keeps the current track playing and drops what's after it", () => {
    setup({ queue: [track("a"), track("b"), track("c")], index: 1 });
    usePlaybackStore.getState().clearQueue();
    const s = usePlaybackStore.getState();
    expect(s.queue.map((t) => t.videoId)).toEqual(["a", "b"]);
    expect(s.index).toBe(1);
    expect(s.playing).toBe(true);
    expect(s.status).toBe("ready");
    expect(s.streamUrl).toBe("blob:prev");
    expect(s.position).toBe(42);
  });

  it("bumps radioEpoch so auto-radio can re-seed from the same track", () => {
    setup({ queue: [track("a"), track("b")], index: 0, radioEpoch: 3 });
    usePlaybackStore.getState().clearQueue();
    expect(usePlaybackStore.getState().radioEpoch).toBe(4);
  });

  it("empties an idle queue", () => {
    setup({ queue: [track("a"), track("b")], index: -1, playing: false });
    usePlaybackStore.getState().clearQueue();
    expect(usePlaybackStore.getState().queue).toEqual([]);
  });

  it("stopPlayback empties everything and stops", () => {
    setup({ queue: [track("a"), track("b")], index: 0 });
    usePlaybackStore.getState().stopPlayback();
    const s = usePlaybackStore.getState();
    expect(s.queue).toEqual([]);
    expect(s.index).toBe(-1);
    expect(s.playing).toBe(false);
    expect(s.status).toBe("idle");
  });
});

describe("playback next()", () => {
  beforeEach(() => setup({}));

  it("replays the current track in place for repeat-one", () => {
    setup({ queue: [track("a"), track("b")], index: 0, repeat: "one" });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(0);
    expect(s.pendingSeek).toBe(0);
    expect(s.position).toBe(0);
    expect(s.playing).toBe(true);
  });

  it("replays in place for repeat-all on a single-track queue", () => {
    // Regression: wrapping a length-1 queue lands on the same index, so
    // the "loading" path never restarts the (already-ended) element and
    // playback used to stall on the loader — the "first click does
    // nothing" bug. It must route through pendingSeek like repeat-one.
    setup({
      queue: [track("a")],
      index: 0,
      repeat: "all",
      status: "ready",
      streamUrl: "blob:a",
    });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(0);
    expect(s.pendingSeek).toBe(0);
    expect(s.playing).toBe(true);
    // Must NOT take the load path (which would stall on a same-index track).
    expect(s.status).not.toBe("loading");
    expect(s.streamUrl).toBe("blob:a");
  });

  it("wraps a multi-track queue back to the first track for repeat-all", () => {
    setup({ queue: [track("a"), track("b")], index: 1, repeat: "all" });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(0);
    expect(s.status).toBe("loading");
    expect(s.streamUrl).toBeUndefined();
    expect(s.pendingSeek).toBeUndefined();
    expect(s.playing).toBe(true);
  });

  it("stops at the end of the queue when repeat is off", () => {
    setup({ queue: [track("a"), track("b")], index: 1, repeat: "off" });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(1);
    expect(s.playing).toBe(false);
    expect(s.position).toBe(0);
  });

  it("advances to the next track mid-queue", () => {
    setup({
      queue: [track("a"), track("b"), track("c")],
      index: 0,
      repeat: "off",
    });
    usePlaybackStore.getState().next();
    const s = usePlaybackStore.getState();
    expect(s.index).toBe(1);
    expect(s.status).toBe("loading");
    expect(s.playing).toBe(true);
  });

  it("is a no-op on an empty queue", () => {
    setup({ queue: [], index: -1, repeat: "all", playing: false });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(-1);
  });
});

// A pending server-side shuffle continuation belongs to the queue it was
// created with — any action that replaces the queue must drop it, or the
// audio engine would append the OLD playlist's shuffle tail onto whatever
// the user played next.
describe("queueContinuation lifecycle", () => {
  beforeEach(() => setup({}));

  it("survives appends but is cleared when the queue is replaced", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    const s = usePlaybackStore.getState();
    s.appendToQueue([track("b")]);
    expect(usePlaybackStore.getState().queueContinuation).toBe("tok1");
    s.setQueue([track("c")], 0);
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("is cleared by playNow", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    usePlaybackStore.getState().playNow(track("b"));
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("is cleared by clearQueue", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    usePlaybackStore.getState().clearQueue();
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("is cleared by stopPlayback", () => {
    setup({ queue: [track("a")], index: 0, queueContinuation: "tok1" });
    usePlaybackStore.getState().stopPlayback();
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });

  it("setQueueContinuation sets and clears the token", () => {
    usePlaybackStore.getState().setQueueContinuation("tok2");
    expect(usePlaybackStore.getState().queueContinuation).toBe("tok2");
    usePlaybackStore.getState().setQueueContinuation(undefined);
    expect(usePlaybackStore.getState().queueContinuation).toBeUndefined();
  });
});

// The album menu's "Play next" queues a whole album by calling
// enqueueNext once per track in reverse — each insert lands directly
// after the current track, so reversing is what restores album order.
// If enqueueNext's insertion point ever changes, this breaks loudly
// instead of silently shuffling every album.
describe("album 'Play next' ordering", () => {
  beforeEach(() => setup({}));

  it("keeps album order when enqueued back-to-front", () => {
    setup({ queue: [track("cur"), track("later")], index: 0 });
    for (const t of [track("a1"), track("a2"), track("a3")].reverse()) {
      usePlaybackStore.getState().enqueueNext(t);
    }
    expect(usePlaybackStore.getState().queue.map((t) => t.videoId)).toEqual([
      "cur",
      "a1",
      "a2",
      "a3",
      "later",
    ]);
  });
});

describe("playback prev()", () => {
  const rule = (
    backButton: "previous" | "restart" | "smart",
    smartBackSeconds = 3,
  ) => usePlaybackSettings.setState({ backButton, smartBackSeconds });

  const mid = (position: number, index = 1) =>
    setup({ queue: [track("a"), track("b"), track("c")], index, position });

  it("smart: rewinds once more than the threshold has played", () => {
    rule("smart", 3);
    mid(10);
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(1);
    expect(usePlaybackStore.getState().pendingSeek).toBe(0);
  });

  it("smart: steps back early in the track", () => {
    rule("smart", 3);
    mid(2);
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(0);
  });

  it("smart: honours the chosen threshold", () => {
    rule("smart", 5);
    mid(4);
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(0);
  });

  it("previous: always steps back, however far in", () => {
    rule("previous");
    mid(120);
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(0);
  });

  it("restart: always rewinds, even at the very start", () => {
    rule("restart");
    mid(0.5);
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(1);
    expect(usePlaybackStore.getState().pendingSeek).toBe(0);
  });

  it("the first track can only rewind", () => {
    rule("previous");
    mid(1, 0);
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(0);
    expect(usePlaybackStore.getState().pendingSeek).toBe(0);
  });
});

describe("radio mix", () => {
  const ids = (q: QueueTrack[]) => q.map((t) => t.videoId).join(",");
  const chips = [
    { label: "All", playlistId: "RDAMVMb" },
    { label: "Chill", playlistId: "RDATx" },
  ];

  it("replaces Up next, then turning it off resumes the album after the seed", () => {
    setup({
      queue: [track("a1"), track("a2"), track("a3"), track("a4")],
      index: 2,
      queueContinuation: "album-tok",
      radio: undefined,
    });
    const s = () => usePlaybackStore.getState();
    s().setRadio([track("a3"), track("r1"), track("r2")], chips, 0, "radio-tok");
    expect(ids(s().queue)).toBe("a1,a2,a3,r1,r2");
    expect(s().index).toBe(2);
    expect(s().queueContinuation).toBe("radio-tok");

    // Chip switch keeps the original resume point.
    s().setRadio([track("c1")], chips, 1, "chip-tok");
    expect(ids(s().queue)).toBe("a1,a2,a3,c1");
    expect(s().radio?.chip).toBe(1);

    // Mix plays on a track, then off: current keeps its slot, album resumes at a4.
    s().next();
    s().stopRadio();
    expect(ids(s().queue)).toBe("a1,a2,a3,c1,a4");
    expect(s().index).toBe(3);
    expect(s().queueContinuation).toBe("album-tok");
    expect(s().radio).toBeUndefined();
  });

  it("persists at most 300 resume tracks", () => {
    const resume = Array.from({ length: 1000 }, (_, i) => track(`t${i}`));
    const saved = persistedRadio({ chips, chip: 0, resume });
    expect(saved?.resume.length).toBe(300);
    expect(saved?.resume[0].videoId).toBe("t0");
    expect(persistedRadio(undefined)).toBeUndefined();
  });

  it("is cleared when the queue is replaced", () => {
    setup({ queue: [track("a")], index: 0, radio: undefined });
    usePlaybackStore.getState().setRadio([track("r")], chips, 0);
    usePlaybackStore.getState().playNow(track("z"));
    expect(usePlaybackStore.getState().radio).toBeUndefined();
  });
});

describe("next() and AI music", () => {
  const ai = (id: string, allowed = false): QueueTrack => ({
    ...track(id),
    artists: [{ id: "UCai", name: "Robot" }],
    ...(allowed ? { aiAllowed: true as const } : {}),
  });

  beforeEach(async () => {
    const { useAiDataStore } = await import("@/lib/ai/data");
    const { useSettingsStore } = await import("@/lib/store/settings");
    useAiDataStore.getState().setData(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        status: { spotify: "ok", lists: "ok", message: null },
        confirmed: { UCai: "Robot" },
        maybeNames: [],
        sources: [],
      },
      Date.now(),
    );
    useSettingsStore.getState().setAiMusic(false);
    setup({});
  });

  it("next() skips held AI tracks", () => {
    setup({ queue: [track("a"), ai("b"), ai("c"), track("d")], index: 0 });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(3);
  });

  it("next() plays an aiAllowed AI track", () => {
    setup({ queue: [track("a"), ai("b", true)], index: 0 });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(1);
  });

  it("next() with only held tracks left stops", () => {
    setup({ queue: [track("a"), ai("b"), ai("c")], index: 0 });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(0);
    expect(usePlaybackStore.getState().playing).toBe(false);
  });

  it("next() under repeat-all wraps past held tracks without looping forever", () => {
    setup({ queue: [track("a"), ai("b")], index: 0, repeat: "all" });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(0);
    setup({ queue: [ai("x"), ai("y")], index: 0, repeat: "all" });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().playing).toBe(false);
  });

  it("setQueue starts past a held AI first track", () => {
    usePlaybackStore.getState().setQueue([ai("x"), track("a"), track("b")], 0);
    expect(usePlaybackStore.getState().index).toBe(1);
  });

  it("setQueue keeps an aiAllowed start", () => {
    usePlaybackStore.getState().setQueue([ai("x", true), track("a")], 0);
    expect(usePlaybackStore.getState().index).toBe(0);
  });

  it("prev() steps back over held AI tracks", () => {
    usePlaybackSettings.setState({ backButton: "previous" });
    setup({ queue: [track("a"), ai("b"), track("c")], index: 2, position: 0 });
    usePlaybackStore.getState().prev();
    expect(usePlaybackStore.getState().index).toBe(0);
  });

  it("plays everything while AI music is on", async () => {
    const { useSettingsStore } = await import("@/lib/store/settings");
    useSettingsStore.getState().setAiMusic(true);
    setup({ queue: [track("a"), ai("b")], index: 0 });
    usePlaybackStore.getState().next();
    expect(usePlaybackStore.getState().index).toBe(1);
  });
});
