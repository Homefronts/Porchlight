import { afterEach, beforeEach, expect, it, vi } from "vitest";

const level = vi.hoisted(() => ({ value: 0.2 }));
vi.mock("@/lib/audio-graph", () => ({
  currentAnalyser: () => ({
    fftSize: 8,
    getFloatTimeDomainData: (f: Float32Array) => f.fill(level.value),
  }),
}));

import { rms, SKIP_RATE, watchSilences } from "./skip-silences";

const el = { paused: false, currentTime: 30, playbackRate: 1 } as unknown as HTMLMediaElement;
let on = true;
let stop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  level.value = 0.2;
  el.playbackRate = 1;
  on = true;
  stop = watchSilences({ active: () => el, wanted: () => on, speed: () => 1 });
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

it("measures loudness", () => {
  expect(rms(new Float32Array([0, 0, 0, 0]))).toBe(0);
  expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
});

it("leaves a short pause alone, and speeds through a long silence until sound returns", () => {
  level.value = 0;
  vi.advanceTimersByTime(1000);
  expect(el.playbackRate).toBe(1);
  vi.advanceTimersByTime(700);
  expect(el.playbackRate).toBe(SKIP_RATE);
  level.value = 0.2;
  vi.advanceTimersByTime(200);
  expect(el.playbackRate).toBe(1);
});

it("does nothing while it's off, and puts the speed back when turned off mid-skip", () => {
  on = false;
  level.value = 0;
  vi.advanceTimersByTime(3000);
  expect(el.playbackRate).toBe(1);
  on = true;
  vi.advanceTimersByTime(2000);
  expect(el.playbackRate).toBe(SKIP_RATE);
  on = false;
  vi.advanceTimersByTime(200);
  expect(el.playbackRate).toBe(1);
});
