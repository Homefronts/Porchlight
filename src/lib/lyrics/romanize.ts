import { pinyin } from "pinyin-pro";
import { romanizeKorean } from "./romanize-korean";
import { romanizeCyrillic, romanizeGreek } from "./romanize-table";

const RE = {
  kana: /[\u3040-\u30ff\u31f0-\u31ff]/,
  hangul: /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/,
  han: /[\u3400-\u4dbf\u4e00-\u9fff]/,
  cyrl: /[\u0400-\u04ff]/,
  grek: /[\u0370-\u03ff\u1f00-\u1fff]/,
  other: /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u0900-\u097f\u0e00-\u0e7f]/,
};

export function needsRomanization(text: string): boolean {
  return scriptOf(text) !== "latin";
}

export function scriptOf(text: string): "ja" | "ko" | "zh" | "cyrl" | "grek" | "other" | "latin" {
  if (RE.kana.test(text)) return "ja";
  if (RE.hangul.test(text)) return "ko";
  if (RE.han.test(text)) return "zh";
  if (RE.cyrl.test(text)) return "cyrl";
  if (RE.grek.test(text)) return "grek";
  if (RE.other.test(text)) return "other";
  return "latin";
}

type Kuro = { convert(s: string, o: object): Promise<string> };
let kuro: Promise<Kuro | null> | null = null;
let failedAt = 0;

// kuroshiro and its analyzer are CJS; under interop the class can sit on `.default`.
const dflt = (m: unknown) => ((m as { default?: unknown }).default ?? m) as new (...a: unknown[]) => unknown;

function japanese(): Promise<Kuro | null> {
  if (kuro && (failedAt === 0 || Date.now() - failedAt < 60_000)) return kuro;
  failedAt = 0;
  kuro = (async () => {
    try {
      const Kuroshiro = dflt(await import("kuroshiro"));
      const Analyzer = dflt(await import("kuroshiro-analyzer-kuromoji"));
      const k = new Kuroshiro() as Kuro & { init(a: unknown): Promise<void> };
      // Node (tests) reads the dictionary from disk; the app fetches the copy Vite serves.
      const dictPath = typeof window === "undefined" ? "node_modules/kuromoji/dict/" : "/kuromoji-dict/";
      await k.init(new Analyzer({ dictPath }));
      return k;
    } catch {
      failedAt = Date.now();
      return null;
    }
  })();
  return kuro;
}

async function romanizeOne(line: string): Promise<string | null> {
  try {
    switch (scriptOf(line)) {
      case "latin":
      case "other":
        return null;
      case "ja": {
        const k = await japanese();
        if (!k) return null;
        // Hepburn writes the particle を as "o"; split on it so honorific お stays "o"
        const out: string[] = [];
        for (const [i, seg] of line.split("を").entries()) {
          if (i > 0) out.push("wo");
          if (seg.trim()) out.push((await k.convert(seg, { to: "romaji", mode: "spaced" })).trim());
        }
        return out.join(" ");
      }
      case "ko":
        return romanizeKorean(line);
      case "zh":
        return pinyin(line, { toneType: "symbol", type: "string" });
      case "cyrl":
        return romanizeCyrillic(line);
      case "grek":
        return romanizeGreek(line);
    }
  } catch {
    return null;
  }
}

export function romanizeLines(lines: string[]): Promise<(string | null)[]> {
  return Promise.all(lines.map(romanizeOne));
}
