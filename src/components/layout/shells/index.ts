import type { ComponentType } from "react";
import type { LayoutId } from "@/lib/theme/looks";
import { IndexShell } from "./index-shell";
import { PanelsShell } from "./panels-shell";
import { SidebarShell } from "./sidebar-shell";
import type { ShellProps } from "./types";

// The other two borrow Sidebar until their own shell lands.
export const SHELLS: Record<LayoutId, ComponentType<ShellProps>> = {
  sidebar: SidebarShell,
  gatefold: SidebarShell,
  index: IndexShell,
  crate: SidebarShell,
  panels: PanelsShell,
};

export function shellFor(layout: LayoutId): ComponentType<ShellProps> {
  return SHELLS[layout] ?? SidebarShell;
}
