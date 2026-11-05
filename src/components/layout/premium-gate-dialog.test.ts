// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => true) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import { PremiumGateDialog } from "./premium-gate-dialog";
import { useFreePlaybackStore, usePremiumStore } from "@/lib/store/premium";
import { usePremiumGateDialog } from "@/lib/store/premium-gate";

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

async function render() {
  const client = new QueryClient();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(PremiumGateDialog)));
  });
  await flush();
  return () => act(() => root.unmount());
}

const playAnyway = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === "Play without Premium");

beforeEach(() => {
  document.body.innerHTML = "";
  useFreePlaybackStore.setState({ enabled: false });
  usePremiumGateDialog.setState({ open: true });
});

it("a Free account must accept the warning before playing without Premium", async () => {
  usePremiumStore.setState({ status: "free" });
  const unmount = await render();
  expect(document.body.textContent).toContain("accept no responsibility");
  expect(playAnyway()!.disabled).toBe(true);
  expect(useFreePlaybackStore.getState().enabled).toBe(false);

  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(playAnyway()!.disabled).toBe(false);
  await act(async () => playAnyway()!.click());
  expect(useFreePlaybackStore.getState().enabled).toBe(true);
  unmount();
});

it("nobody else is offered it", async () => {
  usePremiumStore.setState({ status: null });
  const unmount = await render();
  expect(playAnyway()).toBeUndefined();
  unmount();
});
