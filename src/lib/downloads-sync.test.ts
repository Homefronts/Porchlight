import { beforeEach, describe, expect, it, vi } from "vitest";

let activeAccount = "A";
const invoke = vi.fn(async (cmd: string, _args?: unknown) =>
  cmd === "list_accounts"
    ? [{ id: activeAccount, pageId: null, isActive: true }]
    : undefined,
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const fetchPlaylist = vi.fn();
vi.mock("@/lib/innertube/playlist", () => ({ fetchPlaylist }));
const fetchAlbum = vi.fn();
vi.mock("@/lib/innertube/album", () => ({ fetchAlbum }));

const { useDownloadsStore } = await import("@/lib/downloads");
const { fetchCollectionInput, syncCollection, syncAllDownloads } = await import(
  "@/lib/downloads-sync"
);
const setCalls = () => invoke.mock.calls.filter((c) => c[0] === "downloads_set_collection");

describe("downloads sync", () => {
  beforeEach(() => {
    invoke.mockClear();
    fetchPlaylist.mockReset();
    activeAccount = "A";
    useDownloadsStore.getState().setIndex({
      version: 1,
      collections: {
        P1: {
          id: "P1",
          kind: "playlist",
          title: "Mix",
          subtitle: null,
          coverUrl: null,
          coverFile: null,
          trackIds: ["a"],
          syncedAt: 1,
          owner: null,
        },
      },
      tracks: {},
    });
  });

  it("syncCollection leaves the index alone when the fetch throws", async () => {
    fetchPlaylist.mockRejectedValue(new Error("continuation 500"));
    await syncCollection("P1");
    expect(fetchPlaylist).toHaveBeenCalledWith("P1", { strict: true });
    expect(setCalls()).toHaveLength(0);
  });

  it("syncCollection sends the fresh list on success", async () => {
    fetchPlaylist.mockResolvedValue({
      id: "P1",
      title: "Mix",
      thumbnails: [],
      tracks: [{ kind: "song", id: "b", title: "b", thumbnails: [] }],
    });
    await syncCollection("P1");
    expect(invoke).toHaveBeenCalledWith(
      "downloads_set_collection",
      expect.objectContaining({
        input: expect.objectContaining({ id: "P1", kind: "playlist" }),
      }),
    );
  });

  it("album tracks inherit the album's linked artists", async () => {
    const artists = [{ id: "UC1", name: "Band" }];
    fetchAlbum.mockResolvedValue({
      id: "MPRE1",
      title: "Record",
      artists,
      thumbnails: [],
      tracks: [{ kind: "song", id: "s1", title: "One", thumbnails: [] }],
    });
    const input = await fetchCollectionInput("album", "MPRE1");
    expect(input.tracks[0].meta.artists).toEqual(artists);
  });

  it("Liked Songs is tagged with the account that downloaded it", async () => {
    fetchPlaylist.mockResolvedValue({
      id: "LM",
      title: "Liked",
      thumbnails: [],
      tracks: [{ kind: "song", id: "x", title: "x", thumbnails: [] }],
    });
    expect((await fetchCollectionInput("liked", "LM")).owner).toBe("A:");
  });

  it("another account's sync never replaces downloaded Liked Songs", async () => {
    const idx = useDownloadsStore.getState().index;
    useDownloadsStore.getState().setIndex({
      ...idx,
      collections: {
        LM: { ...idx.collections.P1, id: "LM", kind: "liked", owner: "A:" },
      },
    });
    activeAccount = "B";
    await syncCollection("LM");
    expect(fetchPlaylist).not.toHaveBeenCalled();
  });

  it("overlapping sync-all calls share one run", async () => {
    fetchPlaylist.mockResolvedValue({
      id: "P1",
      title: "Mix",
      thumbnails: [],
      tracks: [{ kind: "song", id: "b", title: "b", thumbnails: [] }],
    });
    await Promise.all([syncAllDownloads(), syncAllDownloads()]);
    expect(fetchPlaylist).toHaveBeenCalledTimes(1);
  });

  it("fetchCollectionInput rejects an empty list", async () => {
    fetchPlaylist.mockResolvedValue({ id: "P1", title: "Mix", thumbnails: [], tracks: [] });
    await expect(fetchCollectionInput("playlist", "P1")).rejects.toThrow();
  });
});
