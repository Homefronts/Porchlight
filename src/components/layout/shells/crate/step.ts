/** The front record after a step of `dir`, held inside a shelf of `length`. */
export function crateStep(index: number, dir: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index + dir, 0), length - 1);
}

/** The tone arm's angle: 6 degrees sits on the outer edge, 42 just short of the label. */
export function needleAngle(position: number, duration: number): number {
  const played = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;
  return 6 + played * 36;
}
