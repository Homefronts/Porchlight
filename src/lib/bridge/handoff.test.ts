// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  const m = new Map<string, string>([
    ["ytm-settings", '{"a":1}'],
    ["ytm-looks", '{"b":2}'],
    ["ytubic-query-cache", "big"],
    ["ytubic-cover-cache", "big"],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  });
});
vi.mock("idb-keyval", () => ({
  createStore: vi.fn(() => "store"),
  entries: vi.fn(async () => [
    ["ytm-playback", "queue"],
    ["ytm-library", { x: 1 }],
  ]),
}));

import { collectHandoff } from "./handoff";

it("collects settings and stores, leaving the caches out", async () => {
  const h = await collectHandoff();
  expect(h.localStorage["ytm-settings"]).toBe('{"a":1}');
  expect(h.localStorage["ytm-looks"]).toBe('{"b":2}');
  expect(h.localStorage).not.toHaveProperty("ytubic-query-cache");
  expect(h.localStorage).not.toHaveProperty("ytubic-cover-cache");
  expect(h.idb).toEqual({ "ytm-playback": "queue", "ytm-library": { x: 1 } });
});
