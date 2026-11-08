/** Copy of `list` with the item at `from` moved to index `to`. Out-of-range moves return an unchanged copy. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
