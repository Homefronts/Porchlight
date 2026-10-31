// @vitest-environment jsdom
import { act, createElement, useContext, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
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
import { PanelsShell } from "./panels-shell";
import { IndexShell } from "./index-shell";
import { GatefoldShell } from "./gatefold-shell";
import { usePersistentPage } from "./persistent-page";
import { sidebarInsets, useShellInsets } from "./insets";
import {
  RouteHeaderSlot,
  RouteHeaderSlotContext,
  RouteHeaderSlotProvider,
} from "./route-header-slot";
import type { ShellProps } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LAYOUTS: LayoutId[] = ["sidebar", "gatefold", "index", "crate", "panels"];

it("maps sidebar, gatefold, index and panels to their own shells", () => {
  expect(shellFor("gatefold")).toBe(GatefoldShell);
  expect(shellFor("sidebar")).toBe(SidebarShell);
  expect(shellFor("index")).toBe(IndexShell);
  expect(shellFor("panels")).toBe(PanelsShell);
});

it("has a shell for every layout", () => {
  for (const id of LAYOUTS) expect(SHELLS[id]).toBeTypeOf("function");
});

it("keeps the page, its scroller, scroll, focus and header slot across a shell swap", () => {
  // Two distinct shells with different trees, so a swap remounts everything
  // that isn't held by usePersistentPage.
  const slot = createElement(RouteHeaderSlot);
  const A = (p: ShellProps) => createElement("section", { id: "a" }, slot, p.page);
  const B = (p: ShellProps) =>
    createElement("div", { id: "b" }, createElement("aside", null, p.page), slot);
  const shells: Partial<Record<LayoutId, ComponentType<ShellProps>>> = {
    sidebar: A,
    gatefold: B,
  };

  function Counter() {
    const [n, setN] = useState(0);
    return createElement("button", { id: "count", onClick: () => setN(n + 1) }, String(n));
  }
  function Header() {
    const target = useContext(RouteHeaderSlotContext);
    return target ? createPortal(createElement("h1", { id: "title" }), target) : null;
  }
  const pageEl = createElement(
    "main",
    { id: "scroller" },
    createElement(Counter),
    createElement("input", { id: "search" }),
    createElement(Header),
  );

  function Host() {
    const layout = useThemeStore((s) => s.layout);
    const { page, portal } = usePersistentPage(pageEl);
    const Shell = shells[layout]!;
    return createElement(
      RouteHeaderSlotProvider,
      null,
      createElement(Shell, { page, nav: null, dial: null, hasTrack: false }),
      portal,
    );
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(Host)));
  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel);
  act(() => $("#count")!.click());
  act(() => $("#count")!.click());
  expect($("#a #count")?.textContent).toBe("2");
  expect($("#a > [data-route-header-slot] #title")).not.toBeNull();

  const scroller = $("#scroller")!;
  // Model WebView2: taking the scroller out of the document resets scrollTop.
  let top = 0;
  Object.defineProperty(scroller, "scrollTop", {
    get: () => top,
    set: (v: number) => void (top = v),
  });
  const removeChild = Node.prototype.removeChild;
  const spy = vi.spyOn(Node.prototype, "removeChild").mockImplementation(function (
    this: Node,
    child,
  ) {
    const out = removeChild.call(this, child);
    if (child.contains(scroller)) top = 0;
    return out as never;
  });
  scroller.scrollTop = 480;
  const search = $<HTMLInputElement>("#search")!;
  search.focus();
  expect(document.activeElement).toBe(search);

  act(() => useThemeStore.setState({ layout: "gatefold" }));
  spy.mockRestore();
  expect($("#a")).toBeNull();
  expect($("#b aside #count")?.textContent).toBe("2");
  expect($("#b aside #scroller")).toBe(scroller);
  expect(scroller.scrollTop).toBe(480);
  expect(document.activeElement).toBe(search);
  expect($("#b > [data-route-header-slot] #title")).not.toBeNull();

  act(() => useThemeStore.setState({ layout: "sidebar" }));
  expect($("#a #count")?.textContent).toBe("2");
  expect($("#a #scroller")).toBe(scroller);
  expect($("#a > [data-route-header-slot] #title")).not.toBeNull();
  act(() => root.unmount());
});

it("keeps Sidebar's overlay insets for each player mode", () => {
  expect(sidebarInsets("right", false)).toEqual({ left: "13rem", bottom: "1rem", right: "23rem" });
  expect(sidebarInsets("bottom", false)).toEqual({ left: "13rem", bottom: "6rem", right: "1rem" });
  expect(sidebarInsets("floating", true)).toEqual({ left: "3.5rem", bottom: "1rem", right: "1rem" });
});

it("publishes the insets on <html> and clears them on unmount", () => {
  const root = createRoot(document.createElement("div"));
  function Probe() {
    useShellInsets({ left: "4.5rem", bottom: "120px", right: "1rem" });
    return null;
  }
  const html = document.documentElement.style;
  act(() => root.render(createElement(Probe)));
  expect(html.getPropertyValue("--shell-bottom-inset")).toBe("120px");
  expect(html.getPropertyValue("--shell-right-inset")).toBe("1rem");
  expect(html.getPropertyValue("--shell-left-inset")).toBe("4.5rem");
  act(() => root.unmount());
  expect(html.getPropertyValue("--shell-bottom-inset")).toBe("");
  expect(html.getPropertyValue("--shell-left-inset")).toBe("");
});
