import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottledStorage } from "@/lib/store/throttled-storage";

function memory() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
      writes.push(v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("createThrottledStorage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps saving while the value changes every 250 ms, as during playback", () => {
    const backing = memory();
    const storage = createThrottledStorage(1000, backing);
    for (let t = 0; t < 3000; t += 250) {
      storage.setItem("p", `pos ${t}`);
      vi.advanceTimersByTime(250);
    }
    expect(backing.writes.length).toBeGreaterThanOrEqual(2);
    expect(backing.writes.length).toBeLessThanOrEqual(3);
    expect(backing.data.get("p")).toBe("pos 2750");
  });

  it("writes the latest value once things settle", () => {
    const backing = memory();
    const storage = createThrottledStorage(1000, backing);
    storage.setItem("p", "a");
    storage.setItem("p", "b");
    vi.advanceTimersByTime(1000);
    expect(backing.writes).toEqual(["b"]);
  });

  it("flush writes a pending value right away and only once", () => {
    const backing = memory();
    const storage = createThrottledStorage(1000, backing);
    storage.setItem("p", "now");
    storage.flush();
    expect(backing.data.get("p")).toBe("now");
    vi.advanceTimersByTime(1000);
    expect(backing.writes).toEqual(["now"]);
  });

  it("removeItem drops a pending write", () => {
    const backing = memory();
    const storage = createThrottledStorage(1000, backing);
    storage.setItem("p", "x");
    storage.removeItem("p");
    vi.advanceTimersByTime(1000);
    expect(backing.data.has("p")).toBe(false);
  });
});
