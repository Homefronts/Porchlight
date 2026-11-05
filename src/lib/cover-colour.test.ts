import { expect, it } from "vitest";
import { pickCoverColour } from "./cover-colour";

const image = (...colours: [number, number, number, number][]) =>
  colours.flatMap(([r, g, b, count]) => Array.from({ length: count }, () => [r, g, b, 255]).flat());

it("picks the most present colour, ignoring black and white", () => {
  const cover = image([0, 0, 0, 50], [255, 255, 255, 50], [200, 30, 30, 10], [30, 60, 200, 3]);
  expect(pickCoverColour(cover, false)).toBe("hsl(15 75% 66%)");
});

it("deepens the colour on a light screen", () => {
  expect(pickCoverColour(image([30, 60, 200, 5]), true)).toBe("hsl(225 75% 36%)");
});

it("falls back to a neutral on a black-and-white cover", () => {
  expect(pickCoverColour(image([0, 0, 0, 5], [255, 255, 255, 5]), false)).toBe("hsl(0 0% 82%)");
  expect(pickCoverColour(image([128, 128, 128, 5]), true)).toBe("hsl(0 0% 30%)");
});
