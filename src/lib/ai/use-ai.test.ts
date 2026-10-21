import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/lib/store/settings";
import { useAiDataStore } from "./data";
import { useAiOverridesStore } from "./overrides";
import { aiClassNow, isAiBlocked, isAiHidden } from "./use-ai";

const ai = { artists: [{ id: "UCai", name: "Robot" }] };
const maybe = { artists: [{ name: "Namesake" }] };

beforeEach(() => {
  useAiDataStore.getState().setData(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      status: { spotify: "ok", lists: "ok", message: null },
      confirmed: { UCai: "Robot", UCcw: "Cain Walker" },
      maybeNames: ["namesake"],
      sources: [],
    },
    Date.now(),
  );
  useAiOverridesStore.setState({ byChannel: {} });
  useSettingsStore.getState().setAiMusic(true);
});

describe("isAiBlocked", () => {
  it("blocks nothing while AI music is on", () => {
    expect(aiClassNow(ai)).toBe("ai");
    expect(isAiBlocked(ai)).toBe(false);
  });
  it("blocks only confirmed AI when off", () => {
    useSettingsStore.getState().setAiMusic(false);
    expect(isAiBlocked(ai)).toBe(true);
    expect(isAiBlocked(maybe)).toBe(false);
  });
  it("respects a Not AI override", () => {
    useSettingsStore.getState().setAiMusic(false);
    useAiOverridesStore.getState().set("UCai", "not-ai");
    expect(isAiBlocked(ai)).toBe(false);
    useAiOverridesStore.getState().set("UCai", null);
    expect(isAiBlocked(ai)).toBe(true);
  });
});

describe("isAiHidden", () => {
  const copy = { artists: [{ id: "UCcopy", name: "Cain Walker Music" }] };
  it("hides look-alikes from mixes but doesn't hold them in the library", () => {
    useSettingsStore.getState().setAiMusic(false);
    expect(isAiHidden(copy)).toBe(true);
    expect(isAiHidden(ai)).toBe(true);
    expect(isAiBlocked(copy)).toBe(false);
  });
  it("hides nothing while AI music is on", () => {
    expect(isAiHidden(copy)).toBe(false);
  });
});
