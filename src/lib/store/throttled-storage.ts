import type { StateStorage } from "zustand/middleware";

/**
 * Writes the newest value at most once per `delay`, and keeps doing so
 * while changes keep coming. A debounce would restart its timer on every
 * change and, with the playback position ticking several times a second,
 * never write at all until playback stopped. `flush` writes whatever is
 * pending right away, for moments the app is about to go (update, quit).
 */
export function createThrottledStorage(
  delay: number,
  backing: StateStorage,
): StateStorage & { flush: () => void } {
  const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();
  const write = (name: string) => {
    const item = pending.get(name);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(name);
    void backing.setItem(name, item.value);
  };
  return {
    getItem: (name) => backing.getItem(name),
    setItem: (name, value) => {
      const existing = pending.get(name);
      if (existing) existing.value = value;
      else pending.set(name, { value, timer: setTimeout(() => write(name), delay) });
    },
    removeItem: (name) => {
      const existing = pending.get(name);
      if (existing) clearTimeout(existing.timer);
      pending.delete(name);
      void backing.removeItem(name);
    },
    flush: () => {
      for (const name of [...pending.keys()]) write(name);
    },
  };
}
