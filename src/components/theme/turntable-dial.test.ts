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
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
});

import { SidebarProvider } from "@/components/ui/sidebar";
import { useThemeStore } from "@/lib/theme/store";
import { anyDialogOpen, TurntableDial } from "./turntable-dial";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("a notch picks its own layout; the knob turns one notch", () => {
  // No [data-layout-flip] in the page, so each turn swaps at once.
  useThemeStore.setState({ layout: "sidebar", pickerSeen: true, dialTipSeen: true });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => root.render(createElement(SidebarProvider, null, createElement(TurntableDial))));
  const radio = (name: string) => host.querySelector<HTMLElement>(`[role=radio][aria-label=${name}]`)!;
  const layout = () => useThemeStore.getState().layout;

  act(() => radio("Crate").click());
  expect(layout()).toBe("crate");
  act(() => radio("Crate").click());
  expect(layout()).toBe("crate");
  act(() => host.querySelector<HTMLElement>("[role=radiogroup]")!.click());
  expect(layout()).toBe("panels");
  act(() => root.unmount());
  host.remove();
});

it("a mounted dialog counts as open, even while it is closing; a popover does not", () => {
  const dialog = document.body.appendChild(document.createElement("div"));
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("data-state", "open");
  const pop = document.body.appendChild(document.createElement("div"));
  pop.setAttribute("data-radix-popper-content-wrapper", "");
  const tip = pop.appendChild(document.createElement("div"));
  tip.setAttribute("role", "dialog");
  tip.setAttribute("data-state", "open");
  expect(anyDialogOpen()).toBe(true);
  dialog.setAttribute("data-state", "closed");
  expect(anyDialogOpen()).toBe(true);
  dialog.remove();
  expect(anyDialogOpen()).toBe(false);
  pop.remove();
});

it("keeps the layout tip unseen while What's New is open", async () => {
  useThemeStore.setState({ layout: "sidebar", pickerSeen: true, dialTipSeen: false });
  const dialog = document.body.appendChild(document.createElement("div"));
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("data-state", "open");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(SidebarProvider, null, createElement(TurntableDial)));
  });
  expect(useThemeStore.getState().dialTipSeen).toBe(false);
  expect(document.body.textContent).not.toContain("Turn this to change layouts.");
  dialog.setAttribute("data-state", "closed");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(useThemeStore.getState().dialTipSeen).toBe(false);
  expect(document.body.textContent).not.toContain("Turn this to change layouts.");
  await act(async () => {
    dialog.remove();
    document.body.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(useThemeStore.getState().dialTipSeen).toBe(false);
  expect(document.body.textContent).toContain("Turn this to change layouts.");
  act(() => root.unmount());
  host.remove();
});
