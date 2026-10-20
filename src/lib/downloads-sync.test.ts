import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async () => undefined);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const fetchPlaylist = vi.fn();
vi.mock("@/lib/innertube/playlist", () => ({ fetchPlaylist }));
vi.mock("@/lib/innertube/album", () => ({ fetchAlbum: vi.fn() }));

const { useDownloadsStore } = await import("@/lib/downloads");
const { fetchCollectionInput, syncCollection } = await import("@/lib/downloads-sync");

describe("downloads sync", () => {
  beforeEach(() => {
    invoke.mockClear();
    fetchPlaylist.mockReset();
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
        },
      },
      tracks: {},
    });
  });

  it("syncCollection leaves the index alone when the fetch throws", async () => {
    fetchPlaylist.mockRejectedValue(new Error("continuation 500"));
    await syncCollection("P1");
    expect(fetchPlaylist).toHaveBeenCalledWith("P1", { strict: true });
    expect(invoke).not.toHaveBeenCalled();
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

  it("fetchCollectionInput rejects an empty list", async () => {
    fetchPlaylist.mockResolvedValue({ id: "P1", title: "Mix", thumbnails: [], tracks: [] });
    await expect(fetchCollectionInput("playlist", "P1")).rejects.toThrow();
  });
});
