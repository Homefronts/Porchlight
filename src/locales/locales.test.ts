import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS, type Dict } from "../lib/i18n/translate";

const dir = join(process.cwd(), "src/locales");
const PLURAL = /_(zero|one|two|few|many|other)$/;
const DASHES = /[—–]/;

const read = (lang: string): Dict => JSON.parse(readFileSync(join(dir, `${lang}.json`), "utf8"));

function leaves(d: Dict, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string") out.set(prefix + k, v);
    else leaves(v, `${prefix}${k}.`, out);
  }
  return out;
}

const base = (k: string) => k.replace(PLURAL, "");
const blanks = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const sorted = (s: Iterable<string>) => [...s].sort();

const en = leaves(read("en"));
const enBases = new Set([...en.keys()].map(base));
const enBlanks = new Map<string, Set<string>>();
for (const [k, v] of en) {
  const b = enBlanks.get(base(k)) ?? new Set<string>();
  for (const x of blanks(v)) b.add(x);
  enBlanks.set(base(k), b);
}

describe("locale files", () => {
  it("all 14 exist", () => {
    for (const lang of LANGS) expect(existsSync(join(dir, `${lang}.json`)), lang).toBe(true);
  });

  for (const lang of LANGS) {
    describe(lang, () => {
      it("parses", () => {
        expect(() => read(lang)).not.toThrow();
      });

      // A missing or broken file fails the tests above, not the whole run.
      let map = new Map<string, string>();
      try {
        map = leaves(read(lang));
      } catch {
        // Reported by "parses".
      }

      it("has no em or en dashes", () => {
        for (const [k, v] of map) expect(DASHES.test(v), `${lang} ${k}`).toBe(false);
      });

      // Empty files are filled later; only check the ones that have content.
      if (map.size === 0) return;

      it("has exactly en's keys", () => {
        expect(sorted(new Set([...map.keys()].map(base)))).toEqual(sorted(enBases));
      });

      it("has exactly the plural forms its language uses", () => {
        const cats = sorted(new Intl.PluralRules(lang).resolvedOptions().pluralCategories);
        const forms = new Map<string, string[]>();
        for (const k of map.keys()) {
          const m = PLURAL.exec(k);
          if (m) forms.set(base(k), [...(forms.get(base(k)) ?? []), m[1]]);
        }
        for (const [b, f] of forms) expect(sorted(f), `${lang} ${b}`).toEqual(cats);
      });

      it("keeps en's {blanks}", () => {
        for (const [k, v] of map) {
          const want = enBlanks.get(base(k)) ?? new Set<string>();
          const got = blanks(v);
          // A plural form like "one" may spell the number out; every other string keeps all of them.
          if (PLURAL.test(k) && !k.endsWith("_other")) {
            for (const x of got) expect(want.has(x), `${lang} ${k} {${x}}`).toBe(true);
          } else {
            expect(sorted(got), `${lang} ${k}`).toEqual(sorted(want));
          }
        }
      });
    });
  }
});
