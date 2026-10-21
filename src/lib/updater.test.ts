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
});
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

import { useUpdateStore } from "@/lib/store/update";
import { checkForUpdates } from "./updater";

beforeEach(() => {
  vi.clearAllMocks();
  useUpdateStore.getState().reset();
});

it("tells a manual check that an update is already ready", async () => {
  useUpdateStore.getState().setDownloading("1.0.0", null);
  useUpdateStore.getState().setReady();
  await checkForUpdates({ silent: false });
  expect(toast.message).toHaveBeenCalledWith(expect.stringContaining("restart"), expect.anything());
});

it("tells a manual check that an update is already downloading", async () => {
  useUpdateStore.getState().setDownloading("1.0.0", null);
  await checkForUpdates({ silent: false });
  expect(toast.message).toHaveBeenCalledWith(expect.stringContaining("downloading"), expect.anything());
});

it("stays quiet on the silent path", async () => {
  useUpdateStore.getState().setDownloading("1.0.0", null);
  await checkForUpdates({ silent: true });
  expect(toast.message).not.toHaveBeenCalled();
});
