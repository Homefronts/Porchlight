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

import { useLayoutStore } from "@/lib/store/layout";
import { toggleFloating } from "./floating";

it("pops out and back in to the mode it replaced", () => {
  useLayoutStore.setState({ mode: "bottom" });
  toggleFloating();
  expect(useLayoutStore.getState().mode).toBe("floating");
  toggleFloating();
  expect(useLayoutStore.getState().mode).toBe("bottom");
});

it("pops back in to a mode picked elsewhere before floating", () => {
  useLayoutStore.getState().setMode("bottom");
  useLayoutStore.getState().setMode("floating"); // e.g. Sidebar's More menu
  toggleFloating();
  expect(useLayoutStore.getState().mode).toBe("bottom");
});
