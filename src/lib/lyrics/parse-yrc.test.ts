import { describe, expect, it } from "vitest";
import { parseYRC } from "@/lib/lyrics/parse-yrc";

describe("parseYRC", () => {
  it("drops json header lines and reads absolute word starts", () => {
    const lines = parseYRC(
      `{"t":0,"c":[{"tx":"作词: "},{"tx":"X"}]}\n[1000,2000](1000,500,0)Hello (1500,1500,0)sun`,
    );
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

  it("keeps parenthesised word text", () => {
    const [l] = parseYRC("[1000,2000](1000,500,0)(oh) (1500,1500,0)sun");
    expect(l.text).toBe("(oh) sun");
    expect(l.words?.map((w) => w.text)).toEqual(["(oh) ", "sun"]);
  });
});
