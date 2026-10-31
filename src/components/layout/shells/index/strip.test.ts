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

import { usePlaybackStore } from "@/lib/store/playback";
import { IndexStrip } from "./strip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(hasTrack: boolean) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => createElement(IndexStrip, { hasTrack, compact: true }) }),
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

it("the strip has Like and More while playing, and neither when empty", async () => {
  usePlaybackStore.setState({ queue: [{ videoId: "v1", title: "Night Signals", thumbnails: [] }], index: 0 });
  let { container, unmount } = await render(true);
  expect(container.querySelector('button[aria-label="More"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Add to liked"]')).not.toBeNull();
  unmount();
  usePlaybackStore.setState({ queue: [], index: -1 });
  ({ container, unmount } = await render(false));
  expect(container.textContent).toContain("Nothing on the tape");
  expect(container.querySelector('button[aria-label="More"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Add to liked"]')).toBeNull();
  unmount();
});
