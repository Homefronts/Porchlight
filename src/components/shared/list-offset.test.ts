// @vitest-environment jsdom
import { expect, it } from "vitest";
import { flipping, listOffset } from "./list-offset";

it("measures the list from the scroller's content top", () => {
  document.body.innerHTML = `<main><div></div></main>`;
  const scroller = document.querySelector("main")!;
  const list = scroller.querySelector("div")!;
  scroller.getBoundingClientRect = () => ({ top: 36 }) as DOMRect;
  list.getBoundingClientRect = () => ({ top: -438 }) as DOMRect;
  scroller.scrollTop = 4500;
  expect(listOffset(list, scroller)).toBe(-438 - 36 + scroller.scrollTop);
});

it("knows when the layout flip is turning the shell", () => {
  document.body.innerHTML = `<div data-layout-flip><main></main></div>`;
  const flip = document.querySelector<HTMLElement>("[data-layout-flip]")!;
  const scroller = document.querySelector("main")!;
  flip.getAnimations = () => [];
  expect(flipping(scroller)).toBe(false);
  flip.getAnimations = () => [{} as Animation];
  expect(flipping(scroller)).toBe(true);
});

// TrackList's wiring: under a running flip the margin waits, then lands once it clears.
it("re-measures the margin after the flip settles, not during it", async () => {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useListOffset } = await import("./list-offset");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (cb) => frames.push(cb);
  globalThis.cancelAnimationFrame = () => {};

  document.body.innerHTML = `<div data-layout-flip><main><div id="list"></div></main></div><div id="root"></div>`;
  const flip = document.querySelector<HTMLElement>("[data-layout-flip]")!;
  const scroller = document.querySelector("main")!;
  const list = document.getElementById("list")!;
  let listTop = -6438; // skewed by the rotation
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  list.getBoundingClientRect = () => ({ top: listTop }) as DOMRect;
  let animating = true;
  flip.getAnimations = () => (animating ? [{} as Animation] : []);

  let margin = NaN;
  const ref = { current: list };
  const Probe = () => {
    margin = useListOffset(ref, scroller, 1);
    return null;
  };
  await act(async () => createRoot(document.getElementById("root")!).render(createElement(Probe)));
  expect(margin).toBe(0); // not the skewed -6438

  await act(async () => frames.shift()!(0)); // still turning
  expect(margin).toBe(0);

  animating = false;
  listTop = 256;
  await act(async () => frames.shift()!(0));
  expect(margin).toBe(256);
});
