import type { ComponentType } from "react";
import type { LayoutId } from "@/lib/theme/looks";
import { PanelsShell } from "./panels-shell";
import { SidebarShell } from "./sidebar-shell";
import type { ShellProps } from "./types";

// The other three borrow Sidebar until their own shell lands.
export const SHELLS: Record<LayoutId, ComponentType<ShellProps>> = {
  sidebar: SidebarShell,
  gatefold: SidebarShell,
  index: SidebarShell,
  crate: SidebarShell,
  panels: PanelsShell,
};

export function shellFor(layout: LayoutId): ComponentType<ShellProps> {
  return SHELLS[layout] ?? SidebarShell;
}
