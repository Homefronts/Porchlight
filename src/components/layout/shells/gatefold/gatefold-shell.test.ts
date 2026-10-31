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
  // Full width unless a test sets `compact`; it's the same tree with other classes.
  globalThis.matchMedia = ((q: string) => ({
    matches: !!(globalThis as { compact?: boolean }).compact,
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
vi.mock("@/hooks/use-home-feed", () => ({
  useHomeFeed: () => ({
    shelves: [
      { title: "A", items: [{ kind: "song", id: "a1", title: "Pick one", thumbnails: [] }] },
      { title: "B", items: [{ kind: "song", id: "b1", title: "Pick two", thumbnails: [] }] },
    ],
  }),
}));

import { usePlaybackStore } from "@/lib/store/playback";
import { GatefoldShell } from "../gatefold-shell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(hasTrack: boolean) {
  const page = createElement("main", { id: "page", className: "app-scroll" });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () =>
        createElement(GatefoldShell, {
          page,
          nav: null,
          dial: createElement("div", { id: "dial" }),
          hasTrack,
        }),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
    );
  });
  await act(async () => {
    await router.load();
  });
  return { container, unmount: () => act(() => root.unmount()) };
}

it("renders the empty sleeve with picks from Home, the tabs and the page", async () => {
  usePlaybackStore.setState({ queue: [], index: -1 });
  const { container, unmount } = await render(false);
  const left = container.querySelector('section[aria-label="Now playing"]')!;
  expect(left.textContent).toContain("Nothing playing yet");
  expect(left.textContent).toContain("Pick one");
  expect(left.textContent).toContain("Pick two");
  expect(left.querySelector("#dial")).not.toBeNull();
  const tabs = [...container.querySelectorAll('nav[aria-label="Browse"] a')].map((a) => a.textContent);
  expect(tabs).toEqual(["Home", "Explore", "Search", "Library", "Downloads", "Rewind"]);
  expect(container.querySelector("#page")).not.toBeNull();
  expect(document.documentElement.style.getPropertyValue("--shell-left-inset")).toBe("50vw");
  unmount();
});

it("renders the playing record with its transport", async () => {
  usePlaybackStore.setState({
    queue: [{ videoId: "v1", title: "Night Signals", album: "Late Night", thumbnails: [] }],
    index: 0,
  });
  const { container, unmount } = await render(true);
  const left = container.querySelector('section[aria-label="Now playing"]')!;
  expect(left.textContent).toContain("Night Signals");
  expect(left.textContent).toContain("Late Night");
  expect(left.textContent).toContain("Lyric sheet");
  expect(left.querySelector('button[aria-label="Next"]')).not.toBeNull();
  expect(left.querySelector("#dial")).not.toBeNull();
  unmount();
});

it("compact: Like and More sit under the transport while playing, not when empty", async () => {
  (globalThis as { compact?: boolean }).compact = true;
  usePlaybackStore.setState({
    queue: [{ videoId: "v1", title: "Night Signals", thumbnails: [] }],
    index: 0,
  });
  let { container, unmount } = await render(true);
  let left = container.querySelector('section[aria-label="Now playing"]')!;
  expect(left.className).toContain("w-[210px]"); // really the compact column
  expect(left.querySelector('button[aria-label="More"]')).not.toBeNull();
  expect(left.querySelector('button[aria-label="Start radio"]')).not.toBeNull();
  expect(left.querySelector('button[aria-label="Add to liked"]')).not.toBeNull();
  unmount();
  usePlaybackStore.setState({ queue: [], index: -1 });
  ({ container, unmount } = await render(false));
  left = container.querySelector('section[aria-label="Now playing"]')!;
  expect(left.querySelector('button[aria-label="More"]')).toBeNull();
  expect(left.querySelector('button[aria-label="Add to liked"]')).toBeNull();
  unmount();
  (globalThis as { compact?: boolean }).compact = false;
});
