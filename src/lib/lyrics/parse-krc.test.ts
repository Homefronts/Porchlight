import { describe, expect, it } from "vitest";
import { decodeKRC, parseKRC } from "@/lib/lyrics/parse-krc";

const KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

async function encodeKRC(text: string): Promise<string> {
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  void w.write(new TextEncoder().encode(text));
  void w.close();
  const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  const out = new Uint8Array(4 + z.length);
  out.set([107, 114, 99, 49]);
  z.forEach((b, i) => (out[4 + i] = b ^ KEY[i % 16]));
  return Buffer.from(out).toString("base64");
}

const roundTrip = async (t: string) => parseKRC(await decodeKRC(await encodeKRC(t)));

describe("parseKRC", () => {
  it("decodes and reads word offsets relative to the line", async () => {
    const { lines } = await roundTrip("[1000,2000]<0,500,0>Hello <500,1500,0>sun");
    expect(lines).toEqual([
      {
        start: 1,
        end: 3,
        text: "Hello sun",
        words: [
          { start: 1, end: 1.5, text: "Hello " },
          { start: 1.5, end: 3, text: "sun" },
        ],
      },
    ]);
  });

  it("decodes html entities", async () => {
    const { lines } = await roundTrip("[0,1000]<0,1000,0>don&apos;t &amp; go");
    expect(lines[0].text).toBe("don't & go");
  });

  it("drops credit lines", async () => {
    const { lines } = await roundTrip(
      [
        "[0,500]<0,500,0>Moon Song - Ana",
        "[500,500]<0,500,0>Lyrics by：Ben",
        "[1000,500]<0,500,0>作曲 : Ben",
        "[1500,500]<0,500,0>Composed by Ben",
        "[2000,1000]<0,1000,0>Real line",
      ].join("\n"),
    );
    // title line only dropped when title/artist are known; here it stays
    expect(lines.map((l) => l.text)).toEqual(["Moon Song - Ana", "Real line"]);
  });

  it("reads romanization from the language block", async () => {
    const json = JSON.stringify({
      content: [
        { type: 0, lyricContent: [["ro ", "ma"]] },
        { type: 1, lyricContent: [["译文"]] },
      ],
    });
    const b64 = Buffer.from(json).toString("base64");
    const { lines, romanByLine } = await roundTrip(
      `[language:${b64}]\n[1000,1000]<0,1000,0>x`,
    );
    expect(lines).toHaveLength(1);
    expect(romanByLine[0]).toBe("ro ma");
  });

  it("repairs messy word timing", async () => {
    const { lines } = await roundTrip(
      "[1000,2000]<0,0,0>a <500,0,0>b <1500,1000,0>c",
    );
    const w = lines[0].words!;
    expect(w[0]).toMatchObject({ start: 1, end: 1.5 });
    expect(w[1]).toMatchObject({ start: 1.5, end: 2.5 });
    expect(w[2]).toMatchObject({ start: 2.5, end: 3 });
  });
});
