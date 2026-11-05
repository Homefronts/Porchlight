// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
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
  // Full width; the compact form is the same tree with other classes.
  globalThis.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});


// The window chrome talks to Tauri; the shell's own parts are what's under test.
vi.mock("@/components/layout/top-bar", () => ({ TopBar: () => null }));

import type { Shelf } from "@/lib/innertube/types";
import { usePlaybackStore } from "@/lib/store/playback";
import { CrateShell } from "../crate-shell";
import { Crate } from "./parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const song = (id: string, title: string) => ({ kind: "song" as const, id, title, thumbnails: [] });
const SHELVES: Shelf[] = [
  { id: "a", title: "Listen again", items: [song("a1", "Golden Hour"), song("a2", "Paper Lanterns"), song("a3", "Night Drive")] },
  { id: "b", title: "Mixed for you", items: [song("b1", "Supermix")] },
  { id: "c", title: "Quick picks", items: Array.from({ length: 20 }, (_, i) => song(`c${i}`, `Pick ${i}`)) },
];

async function render(hasTrack: boolean) {
  // The page slot holds Home as Crate draws it.
  const page = createElement("main", { id: "page", className: "app-scroll" }, createElement(Crate, { shelves: SHELVES }));
  const router = createRouter({
    routeTree: createRootRoute({
      component: () =>
        createElement(CrateShell, { page, nav: null, hasTrack }),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  });
  await act(async () => {
    await router.load();
  });
  return { container, unmount: () => act(() => root.unmount()) };
}

const key = (el: Element, k: string) =>
  act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));

it("renders the crate, the tabs, the menu and an empty platter", async () => {
  usePlaybackStore.setState({ queue: [], index: -1 });
  const { container, unmount } = await render(false);
  const tabs = [...container.querySelectorAll('nav[aria-label="Browse"] a')].map((a) => a.textContent);
  expect(tabs).toEqual(["Home", "Explore", "Search", "Library", "Downloads", "Rewind"]);
  expect(container.textContent).toContain("MENU");
  const deck = container.querySelector('footer[aria-label="Turntable"]')!;
  expect(deck.textContent).toContain("Nothing playing");
  expect(deck.textContent).toContain("Queue is empty");
  const crate = container.querySelector('[aria-roledescription="crate"]')!;
  expect(crate.getAttribute("aria-label")).toContain("Golden Hour, 1 of 3");
  expect(document.documentElement.style.getPropertyValue("--shell-left-inset")).toBe("1rem");
  unmount();
});

it("flips with the arrows, plays on Enter, and switches shelves at the dividers", async () => {
  usePlaybackStore.setState({ queue: [], index: -1 });
  const { container, unmount } = await render(false);
  const crate = () => container.querySelector('[aria-roledescription="crate"]')!;
  await key(crate(), "ArrowRight");
  await key(crate(), "ArrowRight");
  await key(crate(), "ArrowRight");
  expect(crate().getAttribute("aria-label")).toContain("Night Drive, 3 of 3");
  await key(crate(), "ArrowLeft");
  expect(crate().getAttribute("aria-label")).toContain("Paper Lanterns, 2 of 3");
  // Enter on a button inside the crate belongs to that button, not the crate.
  await key(container.querySelector('button[aria-label="Previous record"]')!, "Enter");
  expect(usePlaybackStore.getState().queue).toHaveLength(0);
  await key(crate(), "Enter");
  expect(usePlaybackStore.getState().queue[0]?.title).toBe("Paper Lanterns");
  const divider = (t: string) =>
    [...container.querySelectorAll('[aria-label="Shelves"] button')].find((b) => b.textContent === t) as HTMLElement;
  await act(() => void divider("Mixed for you").click());
  expect(divider("Mixed for you").getAttribute("aria-pressed")).toBe("true");
  expect(crate().getAttribute("aria-label")).toContain("Supermix, 1 of 1");
  unmount();
});

it("draws only the front and the sleeves near it on a long shelf", async () => {
  usePlaybackStore.setState({ queue: [], index: -1 });
  const { container, unmount } = await render(false);
  const crate = () => container.querySelector('[aria-roledescription="crate"]')!;
  const quick = [...container.querySelectorAll('[aria-label="Shelves"] button')].find((b) => b.textContent === "Quick picks") as HTMLElement;
  await act(() => void quick.click());
  for (let i = 0; i < 10; i++) await key(crate(), "ArrowRight");
  expect(crate().getAttribute("aria-label")).toContain("Pick 10, 11 of 20");
  // The one just flipped past, the front, and three leaning sleeves.
  expect(crate().querySelectorAll("button[style]").length).toBe(5);
  unmount();
});

it("keeps focus on the crate when a sleeve is clicked or a step button reaches an end", async () => {
  usePlaybackStore.setState({ queue: [], index: -1 });
  const { container, unmount } = await render(false);
  const crate = () => container.querySelector('[aria-roledescription="crate"]') as HTMLElement;
  const sleeve = crate().querySelector('button[aria-label="Bring Paper Lanterns to the front"]') as HTMLElement;
  await act(() => void sleeve.click());
  expect(document.activeElement).toBe(crate());
  expect(crate().getAttribute("aria-label")).toContain("Paper Lanterns, 2 of 3");
  const prev = container.querySelector('button[aria-label="Previous record"]') as HTMLElement;
  prev.focus();
  await act(() => void prev.click());
  expect(crate().getAttribute("aria-label")).toContain("Golden Hour, 1 of 3");
  expect(document.activeElement).toBe(crate());
  unmount();
});

it("puts the playing record on the turntable with what's up next", async () => {
  usePlaybackStore.setState({
    queue: [
      { videoId: "v1", title: "Night Signals", thumbnails: [] },
      { videoId: "v2", title: "Paper Lanterns", thumbnails: [], duration: 200 },
    ],
    index: 0,
  });
  const { container, unmount } = await render(true);
  const deck = container.querySelector('footer[aria-label="Turntable"]')!;
  expect(deck.textContent).toContain("Night Signals");
  expect(deck.textContent).toContain("Paper Lanterns");
  expect(deck.textContent).toContain("3:20");
  expect(deck.querySelector('button[aria-label="Next"]')).not.toBeNull();
  expect(deck.querySelector('button[aria-label="Start radio"]')).not.toBeNull();
  unmount();
});
