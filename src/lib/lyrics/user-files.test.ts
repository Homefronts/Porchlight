// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v),
  del: async (k: string) => void store.delete(k),
}));

import { loadLyricsFile, removeLyricsFile, saveLyricsFile } from "./user-files";

const TTML = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1.0" end="3.0"><span begin="1.0" end="2.0">la</span> <span begin="2.0" end="3.0">li</span></p></div></body></tt>`;

beforeEach(() => store.clear());

describe("user lyrics files", () => {
  it("saves and loads a .ttml", async () => {
    const l = await saveLyricsFile("v1", { name: "a.TTML", text: TTML });
    expect(l?.kind).toBe("timed");
    expect(store.has("lyrics-file:v1")).toBe(true);
    expect((await loadLyricsFile("v1"))?.kind).toBe("timed");
  });
  it("reads a .xml as TTML", async () => {
    expect((await saveLyricsFile("v5", { name: "a.xml", text: TTML }))?.kind).toBe("timed");
  });
  it("saves and loads a .lrc", async () => {
    const l = await saveLyricsFile("v2", { name: "a.lrc", text: "[00:01.00]la la\n[00:03.00]li li" });
    expect(l?.kind).toBe("timed");
    expect((await loadLyricsFile("v2"))?.kind).toBe("timed");
  });
  it("rejects .txt, broken ttml and empty lrc without saving", async () => {
    expect(await saveLyricsFile("v3", { name: "a.txt", text: "hello" })).toBeNull();
    expect(await saveLyricsFile("v3", { name: "a.ttml", text: "<nope" })).toBeNull();
    expect(await saveLyricsFile("v3", { name: "a.lrc", text: "no stamps" })).toBeNull();
    expect(store.size).toBe(0);
  });
  it("remove deletes", async () => {
    await saveLyricsFile("v4", { name: "a.lrc", text: "[00:01.00]la" });
    await removeLyricsFile("v4");
    expect(await loadLyricsFile("v4")).toBeNull();
  });
});
