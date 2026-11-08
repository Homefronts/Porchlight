// Cyrillic (BGN/PCGN-like, simplified) and Greek (ELOT 743-like, simplified) letter tables.
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  є: "ye", і: "i", ї: "yi", ґ: "g", ў: "u", ђ: "dj", ј: "j", љ: "lj", њ: "nj", ћ: "c", џ: "dz",
};
const GRE: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l",
  μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f",
  χ: "ch", ψ: "ps", ω: "o", ά: "a", έ: "e", ή: "i", ί: "i", ό: "o", ύ: "y", ώ: "o", ϊ: "i", ϋ: "y",
  ΐ: "i", ΰ: "y",
};

function map(text: string, table: Record<string, string>): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const r = table[lower];
    if (r === undefined) out += ch;
    else out += ch !== lower && r ? r[0].toUpperCase() + r.slice(1) : r;
  }
  return out;
}

export const romanizeCyrillic = (t: string) => map(t, CYR);
export const romanizeGreek = (t: string) => map(t, GRE);
