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
