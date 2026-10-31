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

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LayoutSubMenu } from "@/components/layout/top-bar";
import { PlayerLayoutRow } from "@/components/settings/appearance-tab";
import { useThemeStore } from "@/lib/theme/store";
import type { LayoutId } from "@/lib/theme/looks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function text(layout: LayoutId, el: ReturnType<typeof createElement>) {
  useThemeStore.setState({ layout });
  document.body.innerHTML = "";
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(el));
  const out = document.body.textContent ?? "";
  await act(async () => root.unmount());
  return out;
}

const menu = () =>
  createElement(
    DropdownMenu,
    { open: true },
    createElement(DropdownMenuTrigger, null, "More"),
    createElement(DropdownMenuContent, null, createElement(LayoutSubMenu)),
  );

it("Settings: Sidebar keeps the three tiles, other layouts get Floating only", async () => {
  const sidebar = await text("sidebar", createElement(PlayerLayoutRow));
  expect(sidebar).toContain("Player Layout");
  expect(sidebar).toContain("Side Card");
  expect(sidebar).toContain("Bottom Bar");
  for (const layout of ["gatefold", "index", "crate", "panels"] as const) {
    const t = await text(layout, createElement(PlayerLayoutRow));
    expect(t).toContain("Floating Player");
    expect(t).not.toContain("Side Card");
    expect(t).not.toContain("Bottom Bar");
  }
});

it("More menu: Sidebar keeps the Layout submenu, other layouts get a Floating window checkbox", async () => {
  const sidebar = await text("sidebar", menu());
  expect(sidebar).toContain("Layout");
  expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull();
  const gatefold = await text("gatefold", menu());
  expect(gatefold).toContain("Floating window");
  expect(gatefold).not.toContain("Layout");
});
