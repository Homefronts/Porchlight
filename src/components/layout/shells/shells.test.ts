// @vitest-environment jsdom
import { act, createElement, useState, type ComponentType } from "react";
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
});

import { useThemeStore } from "@/lib/theme/store";
import type { LayoutId } from "@/lib/theme/looks";
import { SHELLS, shellFor } from "./index";
import { SidebarShell } from "./sidebar-shell";
import { usePersistentPage } from "./persistent-page";
import type { ShellProps } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LAYOUTS: LayoutId[] = ["sidebar", "gatefold", "index", "crate", "panels"];

it("maps sidebar to SidebarShell", () => {
  expect(shellFor("sidebar")).toBe(SidebarShell);
});

it("has a shell for every layout", () => {
  for (const id of LAYOUTS) expect(SHELLS[id]).toBeTypeOf("function");
});

it("keeps the page mounted when the layout swaps the shell", () => {
  // Two distinct shells with different trees, so a swap remounts everything
  // that isn't held by usePersistentPage.
  const A = (p: ShellProps) => createElement("section", { id: "a" }, p.page);
  const B = (p: ShellProps) =>
    createElement("div", { id: "b" }, createElement("aside", null, p.page));
  const shells: Partial<Record<LayoutId, ComponentType<ShellProps>>> = {
    sidebar: A,
    gatefold: B,
  };

  function Counter() {
    const [n, setN] = useState(0);
    return createElement("button", { id: "count", onClick: () => setN(n + 1) }, String(n));
  }
  const pageEl = createElement(Counter);

  function Host() {
    const layout = useThemeStore((s) => s.layout);
    const { page, portal } = usePersistentPage(pageEl);
    const Shell = shells[layout]!;
    return createElement(
      "div",
      null,
      createElement(Shell, { page, nav: null, dial: null, hasTrack: false }),
      portal,
    );
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(Host)));
  const count = () => container.querySelector<HTMLButtonElement>("#count")!;
  act(() => count().click());
  act(() => count().click());
  expect(container.querySelector("#a #count")?.textContent).toBe("2");

  act(() => useThemeStore.setState({ layout: "gatefold" }));
  expect(container.querySelector("#a")).toBeNull();
  expect(container.querySelector("#b aside #count")?.textContent).toBe("2");

  act(() => useThemeStore.setState({ layout: "sidebar" }));
  expect(container.querySelector("#a #count")?.textContent).toBe("2");
  act(() => root.unmount());
});
