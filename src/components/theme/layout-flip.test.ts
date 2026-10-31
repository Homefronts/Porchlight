// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
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
    value: () => ({ matches: false }),
  });
});

import { nextLayout } from "@/lib/theme/layouts";
import { useThemeStore } from "@/lib/theme/store";
import { cycleOnKey, flipTo, turnFrom, useNameCard } from "./layout-flip";

// Each animate() call hands back a `finished` the test settles by hand.
type Run = { resolve: () => void; reject: () => void };
let runs: Run[] = [];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  runs = [];
  document.body.innerHTML = "";
  const el = document.createElement("div");
  el.setAttribute("data-layout-flip", "");
  el.animate = (() => {
    let run!: Run;
    const finished = new Promise<void>((resolve, reject) => (run = { resolve, reject }));
    finished.catch(() => {});
    runs.push(run);
    return { finished, cancel() {} };
  }) as unknown as HTMLElement["animate"];
  document.body.append(el);
  useThemeStore.setState({ layout: "sidebar", pickerSeen: true });
  useNameCard.setState({ id: null, n: 0 });
});

it("two quick turns during a flip land two notches on", async () => {
  flipTo(nextLayout(turnFrom()));
  flipTo(nextLayout(turnFrom()));
  runs[0].resolve();
  await flush();
  expect(useThemeStore.getState().layout).toBe("index");
  runs[1].resolve();
  await flush();
});

it("a cancelled second half doesn't swap or name the layout twice", async () => {
  flipTo("crate");
  runs[0].resolve();
  await flush();
  runs[1].reject();
  await flush();
  expect(useThemeStore.getState().layout).toBe("crate");
  expect(useNameCard.getState().n).toBe(1);
});

it("a cancelled first half still lands once", async () => {
  flipTo("panels");
  runs[0].reject();
  await flush();
  expect(useThemeStore.getState().layout).toBe("panels");
  expect(useNameCard.getState().n).toBe(1);
});

it("Ctrl+L waits for the first-launch picker", async () => {
  const e = { key: "l", ctrlKey: true, metaKey: false, altKey: false, target: document.body };
  useThemeStore.setState({ pickerSeen: false });
  expect(cycleOnKey(e)).toBe(false);
  expect(runs).toHaveLength(0);
  useThemeStore.setState({ pickerSeen: true });
  expect(cycleOnKey(e)).toBe(true);
  runs[0].resolve();
  await flush();
  expect(useThemeStore.getState().layout).toBe("gatefold");
  runs[1].resolve();
  await flush();
});
