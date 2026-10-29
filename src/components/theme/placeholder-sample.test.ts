import { describe, expect, it } from "vitest";
import { BUILT_IN_LOOKS } from "@/lib/theme/looks";
import { placeholderSample } from "./placeholder-sample";

const decode = (uri: string) => decodeURIComponent(uri.split(",", 2)[1] ?? "");

describe("placeholderSample", () => {
  it("is deterministic", () => {
    const l = BUILT_IN_LOOKS.sleeve;
    expect(placeholderSample(l)).toEqual(placeholderSample(l));
  });
  it("uses only inline art, never an external URL", () => {
    const s = placeholderSample(BUILT_IN_LOOKS.paper);
    for (const c of [...s.covers, s.nowPlaying.cover]) {
      expect(c.startsWith("data:image/svg+xml,")).toBe(true);
      expect(decode(c)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    }
  });
  it("draws in the look's colours", () => {
    const l = BUILT_IN_LOOKS.paper;
    const svg = decode(placeholderSample(l).covers[0]);
    expect(svg).toContain(l.seeds.acc);
    expect(svg).toContain(l.seeds.fg);
    expect(placeholderSample(BUILT_IN_LOOKS.sleeve).covers[0]).not.toBe(
      placeholderSample(l).covers[0],
    );
  });
});
