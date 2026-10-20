import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/lib/store/settings";
import { useAiDataStore } from "./data";
import { useAiOverridesStore } from "./overrides";
import { aiClassNow, isAiBlocked } from "./use-ai";

const ai = { artists: [{ id: "UCai", name: "Robot" }] };
const maybe = { artists: [{ name: "Namesake" }] };

beforeEach(() => {
  useAiDataStore.getState().setData(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      status: { spotify: "ok", lists: "ok", message: null },
      confirmed: { UCai: "Robot" },
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
