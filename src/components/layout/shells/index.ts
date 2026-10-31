import type { ComponentType } from "react";
import type { LayoutId } from "@/lib/theme/looks";
import { CrateShell } from "./crate-shell";
import { GatefoldShell } from "./gatefold-shell";
import { IndexShell } from "./index-shell";
import { PanelsShell } from "./panels-shell";
import { SidebarShell } from "./sidebar-shell";
import type { ShellProps } from "./types";

export const SHELLS: Record<LayoutId, ComponentType<ShellProps>> = {
  sidebar: SidebarShell,
  gatefold: GatefoldShell,
  index: IndexShell,
  crate: CrateShell,
  panels: PanelsShell,
};

export function shellFor(layout: LayoutId): ComponentType<ShellProps> {
  return SHELLS[layout] ?? SidebarShell;
}
