// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
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
  createStore: vi.fn((db: string) => db),
  entries: vi.fn(async (db: string) =>
    db === "ytubic-rewind"
      ? [["ytm-rewind-log", [1, 2]]]
      : [
          ["ytm-playback", "queue"],
          ["ytm-library", { x: 1 }],
        ],
  ),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { collectHandoff } from "./handoff";

it("collects settings and stores, leaving the caches out", async () => {
  const h = await collectHandoff();
  expect(h.localStorage["ytm-settings"]).toBe('{"a":1}');
  expect(h.localStorage["ytm-looks"]).toBe('{"b":2}');
  expect(h.localStorage).not.toHaveProperty("ytubic-query-cache");
  expect(h.localStorage).not.toHaveProperty("ytubic-cover-cache");
  expect(h.idb).toEqual({
    "ytubic-stores": { "ytm-playback": "queue", "ytm-library": { x: 1 } },
    "ytubic-rewind": { "ytm-rewind-log": [1, 2] },
  });
});
