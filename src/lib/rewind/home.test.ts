import { expect, it } from "vitest";
import { unseenRewind } from "./home";
import type { Rewind } from "./types";

const r = (quarter: Rewind["quarter"]) => ({ quarter }) as Rewind;

it("offers the newest rewind on Home until it's been opened", () => {
  expect(unseenRewind([r("2026-Q3"), r("2026-Q2")], null)?.quarter).toBe("2026-Q3");
  expect(unseenRewind([r("2026-Q3"), r("2026-Q2")], "2026-Q3")).toBeNull();
  expect(unseenRewind([], null)).toBeNull();
});
