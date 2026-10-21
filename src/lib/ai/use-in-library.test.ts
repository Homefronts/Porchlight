// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/store/auth-queries", () => ({
  authLoggedInQuery: { queryKey: ["auth"], queryFn: async () => true },
}));
vi.mock("@/lib/innertube/library", () => ({
  // Never resolves: the library is still loading.
  fetchLibraryPlaylists: () => new Promise(() => {}),
  fetchLibraryAlbums: () => new Promise(() => {}),
}));
vi.mock("@/lib/downloads", () => ({
  useDownloadsStore: (sel: (s: unknown) => unknown) => sel({ index: { collections: {} } }),
}));

import { useInLibrary } from "./use-in-library";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("counts a page as in library while the library is still loading", async () => {
  let seen: boolean[] = [];
  function Probe() {
    seen.push(useInLibrary("playlist", "PLx"));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Probe)));
  });
  await act(async () => {});
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every(Boolean)).toBe(true);
  root.unmount();
  seen = [];
});
