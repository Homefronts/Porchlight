import { useMemo, type CSSProperties } from "react";
import { activeLook, useThemeStore } from "@/lib/theme/store";
import { playerTokens } from "@/lib/theme/tokens";

/**
 * Style for a layout's player area: the look's player colour tokens, or an
 * empty object (nothing changes) when the look has none. The area paints
 * its own ground with `--player`.
 */
export function usePlayerStyle(): CSSProperties {
  const seeds = useThemeStore((s) => activeLook(s).seeds);
  return useMemo(() => {
    // A hand-edited saved look can lack seeds; the area then keeps the app's tokens.
    try {
      return playerTokens(seeds) as CSSProperties;
    } catch {
      return {};
    }
  }, [seeds]);
}
