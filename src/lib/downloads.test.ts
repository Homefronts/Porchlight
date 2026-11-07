import { describe, expect, it } from "vitest";
import type { DlTrack, DownloadsIndex } from "@/lib/downloads";
import {
  collectionProgress,
  downloadedCoverUrl,
  newestDownloadFirst,
  trackDownloadState,
  trackToInput,
} from "@/lib/downloads";

function tr(videoId: string, state: DlTrack["state"], refs = ["P1"]): DlTrack {
  return {
    videoId,
    meta: { videoId, title: videoId, thumbnails: [] },
    coverUrl: null,
    coverFile: null,
    state,
    error: state === "failed" ? "nope" : null,
    attempts: 0,
    nextTry: 0,
    size: 0,
    refs,
  };
}

const index: DownloadsIndex = {
  version: 1,
  collections: {
    P1: {
      id: "P1",
      kind: "playlist",
      title: "Mix",
      subtitle: null,
      coverUrl: null,
      coverFile: null,
      trackIds: ["a", "b", "c"],
      syncedAt: 1,
      owner: null,
    },
  },
  tracks: { a: tr("a", "done"), b: tr("b", "failed"), c: tr("c", "pending") },
};

describe("downloads selectors", () => {
  it("trackDownloadState reports each state", () => {
    expect(trackDownloadState(index, "a")).toBe("done");
    expect(trackDownloadState(index, "b")).toBe("failed");
    expect(trackDownloadState(index, "c")).toBe("pending");
    expect(trackDownloadState(index, "zzz")).toBe("none");
  });

  it("collectionProgress counts done/failed against total", () => {
    expect(collectionProgress(index, "P1")).toEqual({ done: 1, failed: 1, total: 3 });
    expect(collectionProgress(index, "nope")).toBeNull();
  });

  it("episodes sort newest download first, no time last", () => {
    const t = (videoId: string, downloadedAt?: number) => ({ videoId, title: videoId, thumbnails: [], downloadedAt });
    const out = [t("none"), t("a", 1), t("c", 3), t("b", 2)].sort(newestDownloadFirst);
    expect(out.map((x) => x.videoId)).toEqual(["c", "b", "a", "none"]);
  });

  it("episode info survives the download index", () => {
    const input = trackToInput({
      videoId: "e1",
      title: "Ep",
      thumbnails: [],
      episode: { showId: "s", showTitle: "The Show" },
    });
    expect(input?.meta.episode?.showTitle).toBe("The Show");
  });

  it("trackToInput keeps playable rows and picks the widest cover", () => {
    expect(
      trackToInput({ kind: "album", id: "x", title: "x", thumbnails: [] }),
    ).toBeNull();
    const input = trackToInput({
      kind: "song",
      id: "v1",
      title: "Song",
      thumbnails: [
        { url: "https://i.ytimg.com/small.jpg", width: 60 },
        { url: "https://i.ytimg.com/big.jpg", width: 544 },
      ],
    });
    expect(input?.videoId).toBe("v1");
    expect(input?.coverUrl).toBe("https://i.ytimg.com/big.jpg");
    expect((input?.meta as { title: string }).title).toBe("Song");
  });

  it("downloadedCoverUrl builds a stream-server cover URL", () => {
    expect(downloadedCoverUrl("http://127.0.0.1:1/t", "ab.jpg")).toBe(
      "http://127.0.0.1:1/t/cover/ab.jpg",
    );
    expect(downloadedCoverUrl("http://127.0.0.1:1/t", null)).toBeUndefined();
  });
});
