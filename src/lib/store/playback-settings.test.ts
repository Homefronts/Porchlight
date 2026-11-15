// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const m = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  },
});

const load = async () => {
  vi.resetModules();
  return (await import("./playback-settings")).usePlaybackSettings;
};

beforeEach(() => m.clear());

it("an old WebAudio device id falls back to the system default, other settings kept", async () => {
  m.set("ytm-playback-settings", JSON.stringify({ version: 0, state: { outputDeviceId: "3f9a0c1e7b", crossfadeSec: 5 } }));
  const s = (await load()).getState();
  expect(s.outputDeviceId).toBe("");
  expect(s.crossfadeSec).toBe(5);
});

it("a device name saved by the native engine is kept", async () => {
  m.set("ytm-playback-settings", JSON.stringify({ version: 1, state: { outputDeviceId: "Speakers (Realtek)" } }));
  expect((await load()).getState().outputDeviceId).toBe("Speakers (Realtek)");
});
