import { beforeEach, describe, expect, it } from "vitest";
import { useScrubStore } from "./scrub";

const { setScrub } = useScrubStore.getState();

describe("scrub store", () => {
  beforeEach(async () => {
    setScrub(null);
    await Promise.resolve();
  });

  it("follows a drag and clears on release", async () => {
    setScrub(42);
    expect(useScrubStore.getState().scrub).toBe(42);
    setScrub(null);
    expect(useScrubStore.getState().scrub).toBeNull();
  });

  // Radix fires onValueCommit before onValueChange for an arrow key, so the
  // change right after a clear must not restart the scrub.
  it("ignores a value that arrives in the same tick as the clear", async () => {
    setScrub(null);
    setScrub(59);
    expect(useScrubStore.getState().scrub).toBeNull();
    await Promise.resolve();
    setScrub(30);
    expect(useScrubStore.getState().scrub).toBe(30);
  });
});
