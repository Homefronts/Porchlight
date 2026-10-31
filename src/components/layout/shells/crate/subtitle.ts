import type { MinimalArtist } from "@/lib/innertube/types";

/**
 * The front record's subtitle as runs: plain text ("Album • ", " & B",
 * " • 2020") with each linked artist cut out where its name appears, so the
 * links sit in place and nothing else is lost. No subtitle, the artists alone.
 * shortcut: a linked artist whose name isn't in the subtitle is left out; fine while YTM's subtitle names them all.
 */
export function subtitleRuns(subtitle: string | undefined, artists: MinimalArtist[]): (string | MinimalArtist)[] {
  if (!subtitle) return artists.flatMap((a, i) => (i ? [", ", a] : [a]));
  const runs: (string | MinimalArtist)[] = [];
  let rest = subtitle;
  for (const a of artists) {
    const at = a.id ? rest.indexOf(a.name) : -1;
    if (at < 0) continue;
    if (at) runs.push(rest.slice(0, at));
    runs.push(a);
    rest = rest.slice(at + a.name.length);
  }
  if (rest) runs.push(rest);
  return runs;
}
