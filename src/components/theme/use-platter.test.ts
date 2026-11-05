// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  });
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
});

import { usePlaybackStore } from "@/lib/store/playback";
import { useScrubStore } from "@/lib/store/scrub";
import { platterTime, usePlatter } from "./use-platter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("winds forward and backward with the drag, wrapping round the turn", () => {
  expect(platterTime(1000, 4, 6000)).toBe(2000);
  expect(platterTime(1000, -2, 6000)).toBe(500);
  expect(platterTime(100, -2, 6000)).toBe(5600);
});

it("follows a drag backward, holds still during it, and spins again after", () => {
  const anim = { currentTime: 3000, play: vi.fn(), pause: vi.fn(), cancel: vi.fn() };
  HTMLElement.prototype.animate = vi.fn(() => anim as unknown as Animation);
  usePlaybackStore.setState({ position: 100 });

  const Spinner = () => createElement("div", { ref: usePlatter<HTMLDivElement>(6000, true) });
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Spinner)));

  act(() => useScrubStore.getState().setScrub(96));
  expect(anim.pause).toHaveBeenCalled();
  expect(anim.currentTime).toBe(2000);
  act(() => useScrubStore.getState().setScrub(92));
  expect(anim.currentTime).toBe(1000);

  anim.play.mockClear();
  act(() => useScrubStore.getState().setScrub(null));
  expect(anim.play).toHaveBeenCalled();
  act(() => root.unmount());
  expect(anim.cancel).toHaveBeenCalled();
});
