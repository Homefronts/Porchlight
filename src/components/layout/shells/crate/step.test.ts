import { expect, it } from "vitest";
import { crateStep } from "./step";

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
