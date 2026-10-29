import type { Look } from "@/lib/theme/looks";

export type PreviewSample = {
  name: string;
  /** Image URLs, or "" for a generated shape in the look's colours. */
  covers: string[];
  playlists: string[];
  nowPlaying: { title: string; artist: string; cover: string };
};

// Plain shapes only, so the previews never carry third-party art.
const shapes = [
  (a: string, f: string, _d: string) =>
    `<rect width="100" height="100" fill="${a}"/><circle cx="50" cy="50" r="30" fill="${f}" opacity=".85"/><circle cx="50" cy="50" r="9" fill="${a}"/>`,
  (a: string, f: string, d: string) =>
    `<rect width="100" height="100" fill="${d}"/><rect y="55" width="100" height="45" fill="${a}"/><circle cx="68" cy="34" r="14" fill="${f}"/>`,
  (a: string, f: string, _d: string) =>
    `<rect width="100" height="100" fill="${f}"/><path d="M0 100 L100 0 L100 100Z" fill="${a}"/>`,
  (a: string, f: string, d: string) =>
    `<rect width="100" height="100" fill="${a}"/><rect x="14" y="14" width="72" height="72" fill="none" stroke="${f}" stroke-width="6"/><rect x="34" y="34" width="32" height="32" fill="${d}"/>`,
  (a: string, f: string, d: string) =>
    `<rect width="100" height="100" fill="${d}"/><g fill="${a}"><rect x="12" y="20" width="76" height="9"/><rect x="12" y="45" width="76" height="9"/><rect x="12" y="70" width="76" height="9"/></g><circle cx="30" cy="50" r="11" fill="${f}"/>`,
  (a: string, f: string, d: string) =>
    `<rect width="100" height="100" fill="${a}"/><path d="M0 70 Q25 40 50 70 T100 70 V100 H0Z" fill="${d}"/><path d="M0 50 Q25 20 50 50 T100 50 V60 Q75 90 50 60 T0 60Z" fill="${f}" opacity=".8"/>`,
  (a: string, f: string, d: string) =>
    `<rect width="100" height="100" fill="${f}"/><circle cx="50" cy="50" r="40" fill="${d}"/><circle cx="50" cy="50" r="22" fill="${a}"/><circle cx="50" cy="50" r="5" fill="${f}"/>`,
];

export function placeholderSample(look: Look): PreviewSample {
  const { acc, fg, dim, bg } = look.seeds;
  // Ink looks have acc === fg; dim keeps the shapes from vanishing there.
  const cover = (i: number) => {
    const a = i % 2 || acc === fg ? dim : acc;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes[i](a, fg, bg)}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };
  return {
    name: "Alex",
    covers: [0, 1, 2, 3, 4, 5].map(cover),
    playlists: ["Liked songs", "Road Trip", "Late Night Drive", "focus.", "New Episodes"],
    nowPlaying: { title: "Night Signals", artist: "The Placeholders", cover: cover(6) },
  };
}
