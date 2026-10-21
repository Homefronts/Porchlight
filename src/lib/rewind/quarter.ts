/** Calendar quarters in local time, e.g. "2026-Q3". */
export type QuarterId = `${number}-Q${1 | 2 | 3 | 4}`;

export function quarterOf(ms: number): QuarterId {
  const d = new Date(ms);
  return `${d.getFullYear()}-Q${(Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4}`;
}

function parse(q: QuarterId): [year: number, index: number] {
  const [y, n] = q.split("-Q");
  return [Number(y), Number(n) - 1];
}

/** `end` is exclusive: the first moment of the next quarter. */
export function quarterRange(q: QuarterId): { start: number; end: number } {
  const [y, i] = parse(q);
  return { start: new Date(y, i * 3, 1).getTime(), end: new Date(y, i * 3 + 3, 1).getTime() };
}

export function previousQuarter(q: QuarterId): QuarterId {
  return quarterOf(quarterRange(q).start - 1);
}
