import { useEffect } from "react";
import { showMoveNotice } from "@/lib/bridge/import";

let shown = false;

/** Says once per launch that the Plus data moved (or didn't); waits for the picker. */
export function MoveNotice({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready || shown) return;
    shown = true;
    void showMoveNotice().catch(() => {});
  }, [ready]);
  return null;
}
