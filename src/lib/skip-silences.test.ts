import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The engine's analysis frames, fed by hand: each call is one frame's RMS.
const sub = vi.hoisted(() => ({ fn: null as null | ((bins: number[], rms: number) => void) }));
vi.mock("@/lib/native-media", () => ({
  subscribeAnalysis: (fn: (bins: number[], rms: number) => void) => {
    sub.fn = fn;
    return () => {
      sub.fn = null;
    };
  },
}));

import { SKIP_RATE, watchSilences } from "./skip-silences";

const el = { paused: false, currentTime: 30, playbackRate: 1 };
const frame = (rms: number) => sub.fn?.([], rms);
let on = true;
let stop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  el.playbackRate = 1;
  on = true;
  stop = watchSilences({ active: () => el, wanted: () => on, speed: () => 1 });
  frame(0.2);
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

it("listens to analysis frames only while running", () => {
  expect(sub.fn).not.toBeNull();
  stop();
  expect(sub.fn).toBeNull();
});

it("leaves a short pause alone, and speeds through a long silence until sound returns", () => {
  frame(0);
  vi.advanceTimersByTime(1000);
  expect(el.playbackRate).toBe(1);
  vi.advanceTimersByTime(700);
  expect(el.playbackRate).toBe(SKIP_RATE);
  // Between the two thresholds: still boosted, so a fade-out doesn't flicker.
  frame(0.007);
  vi.advanceTimersByTime(300);
  expect(el.playbackRate).toBe(SKIP_RATE);
  frame(0.2);
  vi.advanceTimersByTime(200);
  expect(el.playbackRate).toBe(1);
});

it("does nothing while it's off, and puts the speed back when turned off mid-skip", () => {
  on = false;
  frame(0);
  vi.advanceTimersByTime(3000);
  expect(el.playbackRate).toBe(1);
  on = true;
  vi.advanceTimersByTime(2000);
  expect(el.playbackRate).toBe(SKIP_RATE);
  on = false;
  vi.advanceTimersByTime(200);
  expect(el.playbackRate).toBe(1);
});
