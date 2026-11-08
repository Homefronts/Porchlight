// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseTTML } from "@/lib/lyrics/parse-ttml";
import { hasWordTiming } from "@/lib/lyrics/types";

const wrap = (head: string, body: string) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata>${head}</metadata></head><body><div>${body}</div></body></tt>`;
const agents =
  `<ttm:agent xml:id="v1"><ttm:name>Ana</ttm:name></ttm:agent><ttm:agent xml:id="v2"><ttm:name>Ben</ttm:name></ttm:agent>`;

describe("parseTTML", () => {
  it("reads lines, words and singers", () => {
    const r = parseTTML(
      wrap(
        agents,
        `<p begin="00:01.000" end="00:03.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500">Hello </span><span begin="00:01.500" end="00:03.000">sun</span></p>`,
      ),
    );
    expect(r).toEqual({
      kind: "timed",
      agents: { v1: "Ana", v2: "Ben" },
      lines: [
        {
          start: 1,
          end: 3,
          text: "Hello sun",
          agent: "v1",
          words: [
            { start: 1, end: 1.5, text: "Hello " },
            { start: 1.5, end: 3, text: "sun" },
          ],
        },
      ],
    });
  });

  it("puts background vocals under their line", () => {
    const r = parseTTML(
      wrap(
        "",
        `<p begin="00:01.000" end="00:04.000"><span begin="00:01.000" end="00:02.000">Main </span><span ttm:role="x-bg"><span begin="00:02.000" end="00:03.000">(echo)</span></span></p>`,
      ),
    );
    if (r?.kind !== "timed") throw new Error("expected timed");
    const l = r.lines[0];
    expect(l.text).toBe("Main");
    expect(l.bg?.text).toBe("(echo)");
    expect(l.bg?.words).toEqual([{ start: 2, end: 3, text: "(echo)" }]);
  });

  it("accepts h:m:s, m:s and plain-seconds times", () => {
    const r = parseTTML(
      wrap(
        "",
        `<p begin="1:02:03.5" end="1:02:05">a</p><p begin="02:03.5" end="02:05">b</p><p begin="7.25s" end="9s">c</p>`,
      ),
    );
    if (r?.kind !== "timed") throw new Error("expected timed");
    expect(r.lines.map((l) => l.start)).toEqual([7.25, 123.5, 3723.5]);
  });

  it("line-timed TTML has no words", () => {
    const r = parseTTML(wrap("", `<p begin="1s" end="2s">just text</p>`));
    if (r?.kind !== "timed") throw new Error("expected timed");
    expect(r.lines[0].words).toBeUndefined();
    expect(hasWordTiming(r)).toBe(false);
  });

  it("garbage returns null", () => {
    expect(parseTTML("not xml <<<")).toBeNull();
    expect(parseTTML("<a/>")).toBeNull();
  });

  it("hasWordTiming is true only with words", () => {
    expect(hasWordTiming(null)).toBe(false);
    expect(
      hasWordTiming({
        kind: "timed",
        lines: [{ start: 0, text: "a", words: [{ start: 0, end: 1, text: "a" }] }],
      }),
    ).toBe(true);
  });

  it("records a nameless group agent as 'group'", () => {
    const r = parseTTML(
      wrap(
        `<ttm:agent xml:id="g1" type="group"/>`,
        `<p begin="00:01.000" end="00:03.000" ttm:agent="g1">Hi</p>`,
      ),
    );
    expect(r?.kind === "timed" && r.agents).toEqual({ g1: "group" });
  });
});
