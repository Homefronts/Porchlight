// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/rewind/palette", () => ({ coverBlobUrl: async () => null }));

import type { Ranked, Rewind } from "@/lib/rewind/types";
import { RewindStory } from "./rewind-story";
import { slidesFor } from "./slides";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const r = (name: string): Ranked => ({ key: name, name, plays: 10, minutes: 30, thumb: `https://img/${name}` });
const rewind: Rewind = {
  quarter: "2026-Q3", builtAt: 0, minutes: 1284, plays: 400, songs: 212,
  topArtists: [r("Tame Impala"), r("Billie Eilish")], topSongs: [r("Let It Happen"), r("Eventually")], topAlbums: [r("Currents")],
  hours: new Array(24).fill(1), newArtists: [], artistKeys: [],
};

describe("slidesFor", () => {
  it("follows the spec's order and skips slides with no data", () => {
    expect(slidesFor(rewind).map((s) => s.kind)).toEqual([
      "intro", "minutes", "variety", "topArtist", "artists", "topSong", "songs", "topAlbum", "hours", "summary",
    ]);
    expect(slidesFor({ ...rewind, newArtists: [r("New")] }).map((s) => s.kind)).toContain("newArtists");
    expect(slidesFor({ ...rewind, genres: ["folk"] }).map((s) => s.kind)).toContain("genres");
  });
});

describe("RewindStory", () => {
  it("covers the whole window, steps with the arrow keys, closes on Escape, keeps at most two slides mounted", () => {
    const onClose = vi.fn();
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(createElement(RewindStory, { rewind, onClose })));
    // On <body>, not inside the page, so the player bar can't sit on top of it.
    expect(document.querySelector("[role=dialog]")?.parentElement).toBe(document.body);
    const current = () => document.querySelector("[data-slide-current]")?.getAttribute("data-slide-current");
    expect(current()).toBe("intro");
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(current()).toBe("minutes");
    expect(document.querySelectorAll("[data-slide]").length).toBeLessThanOrEqual(2);
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("claims Space and the arrows, so the app's play/pause shortcut doesn't also fire", () => {
    const shell = vi.fn((e: KeyboardEvent) => e.defaultPrevented);
    window.addEventListener("keydown", shell); // like AppShell's, registered first
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(createElement(RewindStory, { rewind, onClose: () => {} })));
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", cancelable: true })));
    expect(shell).toHaveLastReturnedWith(true);
    window.removeEventListener("keydown", shell);
    act(() => root.unmount());
  });
});
