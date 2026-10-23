import { describe, expect, it } from "vitest";
import { inAppLibrary, usePinnedPlaylistsStore } from "./pinned-playlists";

const zoom = { id: "VLPLzoom", title: "zoom." };

describe("app library playlists", () => {
  it("saves once per account, unsaves, and ignores calls while signed out", () => {
    const s = usePinnedPlaylistsStore.getState();
    s.setActiveAccount(null);
    s.save(zoom);
    expect(usePinnedPlaylistsStore.getState().savedByAccount).toEqual({});

    s.setActiveAccount("acct-a");
    s.save(zoom);
    s.save(zoom);
    expect(usePinnedPlaylistsStore.getState().savedByAccount["acct-a"]).toEqual([zoom]);

    s.setActiveAccount("acct-b");
    expect(usePinnedPlaylistsStore.getState().savedByAccount["acct-b"]).toBeUndefined();

    s.setActiveAccount("acct-a");
    s.unsave(zoom.id);
    expect(usePinnedPlaylistsStore.getState().savedByAccount["acct-a"]).toEqual([]);
  });

  it("remembers a removal, so a playlist YouTube still lists stays out, until it's added back", () => {
    const s = usePinnedPlaylistsStore.getState();
    s.setActiveAccount("acct-c");
    s.unsave("VLPLyt");
    expect(usePinnedPlaylistsStore.getState().removedByAccount["acct-c"]).toEqual(["VLPLyt"]);
    s.save({ id: "VLPLyt", title: "yt" });
    expect(usePinnedPlaylistsStore.getState().removedByAccount["acct-c"]).toEqual([]);
  });
});

describe("inAppLibrary", () => {
  const listed = (ids: string[]) => (id: string) => ids.includes(id);

  it("added in the app wins, then a removal, then YouTube's listing", () => {
    expect(inAppLibrary("VLPLa", [{ id: "VLPLa", title: "a" }], ["VLPLa"], listed([]))).toBe(true);
    expect(inAppLibrary("VLPLa", [], ["VLPLa"], listed(["PLa"]))).toBe(false);
    expect(inAppLibrary("VLPLa", [], [], listed(["PLa"]))).toBe(true);
    expect(inAppLibrary("VLPLa", [], [], listed([]))).toBe(false);
  });

  it("matches ids with or without the VL prefix", () => {
    expect(inAppLibrary("PLa", [{ id: "VLPLa", title: "a" }], [], listed([]))).toBe(true);
    expect(inAppLibrary("VLMPSPx", [{ id: "MPSPx", title: "podcast" }], [], listed([]))).toBe(true);
  });
});

describe("removing a playlist saved under another id form", () => {
  it("removes it, so the button doesn't stick on Remove", () => {
    const s = usePinnedPlaylistsStore.getState();
    s.setActiveAccount("acct-d");
    s.save({ id: "MPSPx", title: "podcast" });
    s.unsave("VLMPSPx");
    expect(usePinnedPlaylistsStore.getState().savedByAccount["acct-d"]).toEqual([]);
    s.save({ id: "VLMPSPx", title: "podcast" });
    expect(usePinnedPlaylistsStore.getState().removedByAccount["acct-d"]).toEqual([]);
  });
});

describe("retitle", () => {
  it("renames a pinned and a saved playlist, whichever id form they were stored under", () => {
    const s = usePinnedPlaylistsStore.getState();
    s.setActiveAccount("acct-e");
    s.pin({ id: "VLPLr", title: "old" });
    s.save({ id: "PLr", title: "old" });
    s.retitle("VLPLr", "new");
    const st = usePinnedPlaylistsStore.getState();
    expect(st.byAccount["acct-e"]?.[0]?.title).toBe("new");
    expect(st.savedByAccount["acct-e"]?.[0]?.title).toBe("new");
  });
});

describe("unpin", () => {
  it("removes a VL pin when called with the bare id (a playlist opened from a share link)", () => {
    const s = usePinnedPlaylistsStore.getState();
    s.setActiveAccount("acct-f");
    s.pin({ id: "VLPLs", title: "shared" });
    s.unpin("PLs");
    expect(usePinnedPlaylistsStore.getState().byAccount["acct-f"]).toEqual([]);
  });
});
