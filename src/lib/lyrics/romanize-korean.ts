// Revised Romanization of Korean, pronunciation-based.
// shortcut: no tensification, palatalisation or ㅎ-aspiration rules; add if lyrics need them.
const L = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const V = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
// final index -> [coda when it stays, consonant carried to a following vowel]
const T: [string, string][] = [
  ["",""],["k","g"],["k","kk"],["k","s"],["n","n"],["n","j"],["n",""],["t","d"],["l","r"],
  ["k","g"],["m","m"],["l","b"],["l","s"],["l","t"],["l","p"],["l",""],["m","m"],["p","b"],
  ["p","s"],["t","s"],["t","ss"],["ng",""],["t","j"],["t","ch"],["k","k"],["t","t"],["p","p"],["",""],
];
// compound finals keep their first consonant as the coda when the second carries over
const KEEP: Record<number, string> = { 3: "k", 5: "n", 6: "n", 9: "l", 10: "l", 11: "l", 12: "l", 13: "l", 14: "l", 15: "l", 18: "p" };
const NASAL: Record<string, string> = { k: "ng", t: "n", p: "m" };

const isH = (c: number) => c >= 0xac00 && c <= 0xd7a3;

export function romanizeKorean(text: string): string {
  const out: string[] = [];
  const syl: { i: string; v: string; c: string; l: number; t: number; idx: number }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!isH(cp)) { out.push(ch); syl.push({ i: ch, v: "", c: "", l: -1, t: 0, idx: out.length - 1 }); continue; }
    const s = cp - 0xac00;
    const t = s % 28;
    syl.push({ i: L[Math.floor(s / 588)], v: V[Math.floor((s % 588) / 28)], c: T[t][0], l: Math.floor(s / 588), t, idx: out.length });
    out.push("");
  }
  for (let k = 0; k + 1 < syl.length; k++) {
    const a = syl[k], b = syl[k + 1];
    if (a.l < 0 || b.l < 0 || a.t === 0) continue;
    if (b.l === 11 && a.t !== 21) {
      // liaison; an h-final is silent
      a.c = KEEP[a.t] ?? "";
      b.i = T[a.t][1];
    } else if (b.l === 2 && a.c === "l") {
      b.i = "l"; // l before n: ll
    } else if (b.l === 2 || b.l === 6) {
      a.c = NASAL[a.c] ?? a.c;
    } else if (b.l === 5) {
      if (a.c === "n" || a.c === "l") { a.c = "l"; b.i = "l"; }
      else if (NASAL[a.c]) { a.c = NASAL[a.c]; b.i = "n"; }
    }
  }
  return syl.map((s) => (s.l < 0 ? s.i : s.i + s.v + s.c)).join("");
}
