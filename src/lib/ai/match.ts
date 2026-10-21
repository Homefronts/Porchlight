/**
 * AI-music matching, shared by the app and the daily data job
 * (`scripts/ai-data/run.ts`). YouTube marks nothing as AI, so the job
 * confirms artists from community lists and a Spotify cross-check and
 * publishes `AiData`; this module classifies what the app shows against it.
 *
 * Kept free of app imports so the job can run it under plain tsx.
 */

export type AiData = {
  version: 1;
  generatedAt: string;
  status: {
    spotify: "ok" | "degraded";
    lists: "ok" | "stale";
    message: string | null;
  };
  /** YouTube channel id → display name, confirmed AI. */
  confirmed: Record<string, string>;
  /** Normalised names that only matched by name ("AI?"). */
  maybeNames: string[];
  sources: { name: string; url: string; license: string }[];
};

export type AiClass = "ai" | "maybe" | null;

/** The user's own calls, keyed by YouTube channel id. Always win. */
export type AiOverrides = Record<string, "ai" | "not-ai">;

export type AiIndex = {
  confirmed: Set<string>;
  confirmedNames: Set<string>;
  maybe: Set<string>;
};

export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

export function normalizeTitle(s: string): string {
  return normalizeName(
    s
      .replace(/[([][^)\]]*[)\]]/g, " ")
      .replace(/\s(feat|ft)\.?\s.*$/i, ""),
  );
}

export function indexAiData(d: AiData): AiIndex {
  return {
    confirmed: new Set(Object.keys(d.confirmed)),
    // YouTube-list channels have no name ("").
    confirmedNames: new Set(Object.values(d.confirmed).map(normalizeName).filter(Boolean)),
    maybe: new Set(d.maybeNames),
  };
}

export function classifyArtists(
  artists: { id?: string; name: string }[] | undefined,
  idx: AiIndex,
  overrides: AiOverrides,
): AiClass {
  let result: AiClass = null;
  for (const a of artists ?? []) {
    const o = a.id ? overrides[a.id] : undefined;
    if (o === "not-ai") continue;
    if (o === "ai" || (a.id && idx.confirmed.has(a.id))) return "ai";
    const n = normalizeName(a.name);
    // A name alone never confirms: a real artist can share it.
    if (idx.maybe.has(n) || idx.confirmedNames.has(n) || idx.confirmedNames.has(lookalikeBase(n))) result = "maybe";
  }
  return result;
}

const COPYCAT_SUFFIX = /\s(music|sounds?|songs|official|tv|band|vevo|records)$/;
const lookalikeBase = (n: string) => n.replace(COPYCAT_SUFFIX, "");

/**
 * Another channel using a confirmed AI act's name, bare or with a suffix
 * ("Cain Walker Music"). Only distinctive names count (two+ words or 8+
 * letters), so a real "Aurora" never vanishes because an AI act shares it.
 */
export function isLookalike(
  artists: { id?: string; name: string }[] | undefined,
  idx: AiIndex,
  overrides: AiOverrides,
): boolean {
  return (artists ?? []).some((a) => {
    if (a.id && overrides[a.id] === "not-ai") return false;
    const n = normalizeName(a.name);
    // Both forms: some AI acts' own names end in a suffix ("Good News Music").
    return [n, lookalikeBase(n)].some((b) => (b.includes(" ") || b.length >= 8) && idx.confirmedNames.has(b));
  });
}
