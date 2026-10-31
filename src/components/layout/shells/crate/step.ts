/** The front record after a step of `dir`, held inside a shelf of `length`. */
export function crateStep(index: number, dir: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index + dir, 0), length - 1);
}
