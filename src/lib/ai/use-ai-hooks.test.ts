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
});

import { useSettingsStore } from "@/lib/store/settings";
import { useAiBlocked } from "./use-ai";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Row() {
  return String(useAiBlocked({ artists: [{ id: "UCx", name: "X" }] }));
}

it("useAiBlocked survives flipping the AI switch (hook order stays fixed)", () => {
  useSettingsStore.getState().setAiMusic(true);
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Row)));
  expect(() => act(() => useSettingsStore.getState().setAiMusic(false))).not.toThrow();
  act(() => root.unmount());
});
