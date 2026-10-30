// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  });
  return { m, idb: new Map<string, unknown>(), invoke: vi.fn(), toast: vi.fn() };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));
vi.mock("idb-keyval", () => ({
  createStore: (db: string) => db,
  get: async (k: string, db: string) => h.idb.get(`${db}/${k}`),
  set: async (k: string, v: unknown, db: string) => void h.idb.set(`${db}/${k}`, v),
}));
vi.mock("sonner", () => {
  const toast = Object.assign(h.toast, { error: h.toast, loading: vi.fn(), dismiss: vi.fn() });
  return { toast };
});

import { importHandoff, showMoveNotice } from "./import";

const serve = (frontend: unknown, status?: unknown) =>
  h.invoke.mockImplementation(async (cmd: string) =>
    cmd === "take_handoff_frontend" ? frontend : cmd === "move_status" ? status : undefined,
  );

beforeEach(() => {
  h.m.clear();
  h.idb.clear();
  h.invoke.mockReset();
  h.toast.mockReset();
});

it("imports_missing_keys_only", async () => {
  h.m.set("keep", "mine");
  h.idb.set("ytubic-stores/a", "mine");
  serve({
    localStorage: { keep: "old", fresh: "x" },
    idb: { "ytubic-stores": { a: "old", b: 1 }, "ytubic-rewind": { c: { n: 2 } } },
  });
  expect(await importHandoff()).toBe("imported");
  expect(h.m.get("keep")).toBe("mine");
  expect(h.m.get("fresh")).toBe("x");
  expect(h.idb.get("ytubic-stores/a")).toBe("mine");
  expect(h.idb.get("ytubic-stores/b")).toBe(1);
  expect(h.idb.get("ytubic-rewind/c")).toEqual({ n: 2 });
  expect(h.invoke).toHaveBeenCalledWith("ack_handoff_imported");
});

it("invalid_shape_writes_nothing_and_does_not_ack", async () => {
  serve({ localStorage: { a: 5 }, idb: {} });
  expect(await importHandoff()).toBe("invalid");
  serve({ idb: {} });
  expect(await importHandoff()).toBe("invalid");
  expect(h.m.size).toBe(0);
  expect(h.invoke).not.toHaveBeenCalledWith("ack_handoff_imported");
});

it("none_when_no_handoff", async () => {
  serve(null);
  expect(await importHandoff()).toBe("none");
  expect(h.invoke).not.toHaveBeenCalledWith("ack_handoff_imported");
});

it("notice_moved_says_so", async () => {
  serve(null, { state: "done", attempts: 1, notice: "moved" });
  await showMoveNotice();
  expect(h.toast).toHaveBeenCalledWith("Moved over from YTubic Plus.");
});

it("notice_failed_has_try_again_that_calls_retry_move", async () => {
  serve(null, { state: "pending", attempts: 3, notice: "failed" });
  await showMoveNotice();
  const [msg, opts] = h.toast.mock.calls[0];
  expect(msg).toBe("Couldn't finish moving your YTubic Plus data. Your old app is still installed.");
  expect(opts.action.label).toBe("Try again");
  opts.action.onClick();
  expect(h.invoke).toHaveBeenCalledWith("retry_move");
});

it("no_notice_when_nothing_to_say", async () => {
  serve(null, { state: "done", attempts: 0, notice: null });
  await showMoveNotice();
  expect(h.toast).not.toHaveBeenCalled();
});
