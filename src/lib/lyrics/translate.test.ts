import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { translateLines } from "./translate";

const fetchMock = vi.mocked(tauriFetch);

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Echoes each q back as "T:<q>" detected as "xx". */
function echo(url: unknown) {
  const qs = new URL(String(url)).searchParams.getAll("q");
  return Promise.resolve(reply(qs.map((q) => [`T:${q}`, "xx"])));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.reject(new Error("unmocked")));
});

describe("translateLines", () => {
  it("batches and maps answers back", async () => {
    fetchMock.mockImplementation(echo);
    const lines = Array.from({ length: 45 }, (_, i) => `line ${i}`);
    const out = await translateLines(lines, "en");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out).toEqual(lines.map((l) => `T:${l}`));
  });

  it("skips lines already in the target language", async () => {
    fetchMock.mockResolvedValue(
      reply([["Hi", "en"], ["I know what I want", "es"]]),
    );
    expect(await translateLines(["Hi", "Yo se lo que quiero"], "en")).toEqual([
      null,
      "I know what I want",
    ]);
  });

  it("matches the primary subtag of the target", async () => {
    fetchMock.mockResolvedValue(reply([["Ola", "pt"]]));
    expect(await translateLines(["Ola"], "pt-BR")).toEqual([null]);
  });

  it("drops translations equal to the original ignoring case and punctuation", async () => {
    fetchMock.mockResolvedValue(reply([["OH, yeah!", "es"], "Plain"]));
    expect(await translateLines(["oh yeah", "Texto"], "en")).toEqual([
      null,
      "Plain",
    ]);
  });

  it("a 429 gives all null", async () => {
    fetchMock.mockResolvedValue(reply({}, 429));
    expect(await translateLines(["a", "b"], "en")).toEqual([null, null]);
  });

  it("a network error or bad body gives all null", async () => {
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(await translateLines(["a"], "en")).toEqual([null]);
    fetchMock.mockResolvedValueOnce(new Response("nope"));
    expect(await translateLines(["a"], "en")).toEqual([null]);
  });

  it("empty and ♪ lines are not sent", async () => {
    fetchMock.mockImplementation(echo);
    const out = await translateLines(["", "♪", "  ", "real"], "en");
    expect(out).toEqual([null, null, null, "T:real"]);
    const qs = new URL(String(fetchMock.mock.calls[0][0])).searchParams.getAll("q");
    expect(qs).toEqual(["real"]);
  });

  it("splits batches by encoded length", async () => {
    fetchMock.mockImplementation(echo);
    const long = "あ".repeat(100); // 900 encoded chars each
    await translateLines([long, long, long, long, long], "en");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});
