import { expect, it } from "vitest";
import { useShowSortStore } from "./show-sort";

it("keeps local follows without duplicates", () => {
  const s = useShowSortStore.getState();
  s.addLocalFollow("a");
  s.addLocalFollow("a");
  expect(useShowSortStore.getState().localFollows).toEqual(["a"]);
  s.removeLocalFollow("a");
  expect(useShowSortStore.getState().localFollows).toEqual([]);
});
