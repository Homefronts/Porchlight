import { useLayoutEffect } from "react";
import type { LayoutMode } from "@/lib/store/layout";
import type { ShellInsets } from "./types";

/**
 * Sidebar's insets: past the nav (expanded or the rail), clear of the side
 * card in `right`, over the bar in `bottom`.
 */
export function sidebarInsets(mode: LayoutMode, collapsed: boolean): ShellInsets {
  return {
    left: collapsed ? "3.5rem" : "13rem",
    bottom: mode === "bottom" ? "6rem" : "1rem",
    right: mode === "right" ? "23rem" : "1rem",
  };
}

/**
 * Publishes the shell's insets on <html>: the overlays they steer are
 * portaled to <body>, outside the shell's own subtree.
 */
export function useShellInsets({ left, bottom, right }: ShellInsets): void {
  useLayoutEffect(() => {
    const s = document.documentElement.style;
    s.setProperty("--shell-left-inset", left);
    s.setProperty("--shell-bottom-inset", bottom);
    s.setProperty("--shell-right-inset", right);
    return () => {
      s.removeProperty("--shell-left-inset");
      s.removeProperty("--shell-bottom-inset");
      s.removeProperty("--shell-right-inset");
    };
  }, [left, bottom, right]);
}
