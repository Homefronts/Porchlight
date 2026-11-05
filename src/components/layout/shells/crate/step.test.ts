import { expect, it } from "vitest";
import { crateStep, needleAngle, needleDropFrames } from "./step";

it("steps the front record and clamps at both ends", () => {
  expect(crateStep(0, 1, 5)).toBe(1);
  expect(crateStep(3, -1, 5)).toBe(2);
  expect(crateStep(0, -1, 5)).toBe(0);
  expect(crateStep(4, 1, 5)).toBe(4);
});

it("pulls an index left past a shorter shelf back in, and handles an empty one", () => {
  expect(crateStep(9, 0, 3)).toBe(2);
  expect(crateStep(2, 1, 0)).toBe(0);
});

it("the needle starts on the edge and moves in as the song plays", () => {
  expect(needleAngle(0, 200)).toBe(6);
  expect(needleAngle(100, 200)).toBe(24);
  expect(needleAngle(200, 200)).toBe(42);
  expect(needleAngle(5, 0)).toBe(6);
  expect(needleAngle(300, 200)).toBe(42);
});

it("the needle lifts where it is, lands on its target, and ends down", () => {
  const frames = needleDropFrames(-8, 6);
  expect(frames[0].transform).toBe("rotate(-8deg) scale(1)");
  expect(frames[1].transform).toBe("rotate(-8deg) scale(1.06)");
  expect(frames[2].transform).toBe("rotate(6deg) scale(1.06)");
  expect(frames[frames.length - 1].transform).toBe("rotate(6deg) scale(1)");
  expect(frames[frames.length - 1].offset).toBe(1);
});
