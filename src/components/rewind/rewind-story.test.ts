// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/rewind/palette", () => ({ coverBlobUrl: async () => null }));

import type { Ranked, Rewind } from "@/lib/rewind/types";
import { RewindStory } from "./rewind-story";
import { THEME, personality, slidesFor } from "./slides";

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
      "intro", "setup", "minutes", "variety", "topArtist", "artists", "songs", "topAlbum", "personality", "summary",
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
    expect(current()).toBe("setup");
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

describe("personality", () => {
  it("names you after the hour you listen most", () => {
    expect(personality(15)).toMatchObject({ name: "The Afternoon Rescuer", line: expect.stringContaining("3 PM") });
    expect(personality(0).name).toBe("The Night Owl");
    expect(personality(22).name).toBe("The Late Night Romantic");
  });
});

describe("slide colours", () => {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  it("keeps every slide readable: text 4.5:1, highlights 3:1", () => {
    for (const [kind, t] of Object.entries(THEME)) {
      if (kind === "summary") continue; // its words sit on a white card
      expect(contrast(t.dark ? "#111111" : "#ffffff", t.bg), `${kind} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.hi, t.bg), `${kind} highlight`).toBeGreaterThanOrEqual(3);
    }
  });
});
