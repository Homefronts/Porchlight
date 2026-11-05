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

export const NEEDLE_REST = -8;

export const NEEDLE_DROP_MS = { gentle: 1200, quick: 650, slow: 2000 } as const;

const armPose = (angle: number, lift: number, offset: number): Keyframe => ({
  offset,
  transform: `rotate(${angle}deg) scale(${1 + lift * 0.06})`,
  boxShadow: lift ? `${lift * 6}px ${lift * 9}px ${lift * 5}px #000b` : "0 0 0 #0000",
});

/** The arm lifts, swings over, and settles with a tiny bounce. */
export function needleDropFrames(from: number, to: number): Keyframe[] {
  return [
    armPose(from, 0, 0),
    armPose(from, 1, 0.2),
    armPose(to, 1, 0.65),
    armPose(to, 0, 0.88),
    armPose(to, 0.16, 0.94),
    armPose(to, 0, 1),
  ];
}
