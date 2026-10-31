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
import { TurntableDial } from "./turntable-dial";

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
});
