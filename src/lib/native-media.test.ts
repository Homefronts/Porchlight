import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = { channel: null as null | { onmessage: (e: unknown) => void } };
  class FakeChannel {
    onmessage: (e: unknown) => void = () => {};
    constructor() {
      state.channel = this;
    }
  }
  return { state, FakeChannel, invoke: vi.fn(async (_cmd: string, _args?: unknown) => undefined) };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: h.FakeChannel }));

import { NativeMedia, subscribeAnalysis } from "./native-media";

const report = (over: Record<string, unknown> = {}) =>
  h.state.channel!.onmessage({
    kind: "state",
    slot: "A",
    generation: 1,
    position: 0,
    duration: 100,
    playing: false,
    loading: false,
    ended: false,
    ...over,
  });
const calls = (cmd: string) => h.invoke.mock.calls.filter((c) => c[0] === cmd);

describe("NativeMedia", () => {
  let m: NativeMedia;
  beforeEach(() => {
    vi.useFakeTimers();
    h.invoke.mockClear();
    m = new NativeMedia("a");
  });

  it("src loads with an incrementing generation", async () => {
    m.src = "http://x/1";
    m.src = "http://x/2";
    await vi.advanceTimersByTimeAsync(0);
    const gens = calls("player_load").map((c) => ((c[1] ?? {}) as { generation: number }).generation);
    expect(gens).toEqual([1, 2]);
    expect((calls("player_load")[0][1] as { slot: string }).slot).toBe("A");
  });

  it("ignores reports from an older generation", async () => {
    m.src = "http://x/1";
    m.src = "http://x/2";
    await vi.advanceTimersByTimeAsync(0);
    report({ generation: 1, position: 50 });
    expect(m.currentTime).toBe(0);
    report({ generation: 2, position: 7 });
    expect(m.currentTime).toBe(7);
  });

  it("interpolates currentTime at the playback rate and snaps to reports", async () => {
    m.src = "http://x/1";
    m.playbackRate = 1.5;
    await vi.advanceTimersByTimeAsync(0);
    void m.play();
    report({ position: 10, playing: true });
    vi.advanceTimersByTime(1000);
    expect(m.currentTime).toBeCloseTo(11.5, 5);
    report({ position: 11.2, playing: true });
    expect(m.currentTime).toBeCloseTo(11.2, 5);
    expect(calls("player_set_speed")).toHaveLength(1);
  });

  it("does not advance while paused", async () => {
    m.src = "http://x/1";
    report({ position: 4 });
    vi.advanceTimersByTime(3000);
    expect(m.currentTime).toBe(4);
    expect(m.paused).toBe(true);
  });

  it("maps an error report to error.code and fires error once", async () => {
    m.src = "http://x/1";
    const onError = vi.fn();
    m.addEventListener("error", onError);
    report({ error_code: 4 });
    report({ error_code: 4 });
    expect(m.error).toEqual({ code: 4 });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("fires ended once and play() restarts", async () => {
    m.src = "http://x/1";
    const onEnded = vi.fn();
    m.addEventListener("ended", onEnded);
    report({ position: 100, ended: true });
    report({ position: 100 });
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(m.ended).toBe(true);
    await m.play();
    expect(calls("player_play")).toHaveLength(1);
  });

  it("fires loadedmetadata when the duration first arrives and timeupdate per report", async () => {
    m.src = "http://x/1";
    const meta = vi.fn();
    const tu = vi.fn();
    m.addEventListener("loadedmetadata", meta);
    m.addEventListener("timeupdate", tu);
    report({ duration: null, loading: true });
    expect(m.duration).toBeNaN();
    report({ duration: 90 });
    report({ duration: 90 });
    expect(meta).toHaveBeenCalledTimes(1);
    expect(tu).toHaveBeenCalledTimes(3);
    expect(m.duration).toBe(90);
  });

  it("sends volume, seek and fade", async () => {
    m.src = "http://x/1";
    m.volume = 0.5;
    m.currentTime = 30;
    m.fadeTo(0, 2, "equalPowerOut");
    await vi.advanceTimersByTimeAsync(0);
    expect(calls("player_set_gain")[0][1]).toEqual({ slot: "A", gain: 0.5 });
    expect(calls("player_seek")[0][1]).toEqual({ slot: "A", seconds: 30 });
    expect(calls("player_fade")[0][1]).toEqual({ slot: "A", targetGain: 0, seconds: 2, curve: "equalPowerOut" });
  });

  it("a fade does not change the slot gain, so a later equal volume still sends", async () => {
    m.src = "http://x/1";
    m.fadeTo(0.2, 1, "linear");
    m.volume = 0.2;
    expect(calls("player_set_gain")).toHaveLength(1);
  });

  it("seeks from a loadedmetadata handler: seeked only after a report near the target", async () => {
    m.src = "http://x/1";
    m.addEventListener("loadedmetadata", () => {
      m.currentTime = 30;
    });
    const seeked = vi.fn();
    m.addEventListener("seeked", seeked);
    report({ position: 0 }); // first duration: handler seeks
    expect(seeked).not.toHaveBeenCalled();
    expect(m.currentTime).toBe(30);
    report({ position: 0.2 }); // in-flight, old position
    expect(m.currentTime).toBe(30);
    expect(seeked).not.toHaveBeenCalled();
    report({ position: 30.1 });
    expect(seeked).toHaveBeenCalledTimes(1);
    expect(m.currentTime).toBeCloseTo(30.1, 5);
  });

  it("a rejected load fires error code 2", async () => {
    h.invoke.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    m.addEventListener("error", onError);
    m.src = "http://x/1";
    await vi.advanceTimersByTimeAsync(0);
    expect(m.error?.code).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("fires pause before ended", async () => {
    m.src = "http://x/1";
    void m.play();
    const order: string[] = [];
    m.addEventListener("pause", () => order.push(`pause:${m.paused}`));
    m.addEventListener("ended", () => order.push("ended"));
    report({ position: 100, ended: true });
    expect(order).toEqual(["pause:true", "ended"]);
  });

  it("routes by slot and forwards analysis frames", async () => {
    const b = new NativeMedia("b");
    b.src = "http://x/b";
    m.src = "http://x/a";
    report({ slot: "B", generation: 1, position: 9 });
    expect(b.currentTime).toBe(9);
    expect(m.currentTime).toBe(0);
    const f = vi.fn();
    subscribeAnalysis(f);
    h.state.channel!.onmessage({ kind: "analysis", bins: [1], rms: 0.2 });
    expect(f).toHaveBeenCalledWith([1], 0.2);
  });
});
