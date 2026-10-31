import { useState } from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { PlayerBarBottom } from "@/components/layout/player-bar-bottom";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import { BackgroundCover } from "@/components/layout/background-cover";
import { useLayoutStore } from "@/lib/store/layout";
import { cn } from "@/lib/utils";
import { DialSlot } from "./dial-slot";
import { RouteHeaderSlot } from "./route-header-slot";
import {
  NowPlayingPanel,
  NowPlayingToggle,
  PANEL,
  PopOutButton,
  useCompact,
} from "./panels/parts";
import type { ShellProps } from "./types";

const noop = () => {};

/**
 * Rounded panels on black: the nav, the page under a wash of the playing
 * cover, Now playing on the right, and the player bar along the bottom.
 * The nav panel and its [data-panels] styles live in index.css.
 */
export function PanelsShell({ page, nav, dial, hasTrack }: ShellProps) {
  const compact = useCompact();
  const [nowOpen, setNowOpen] = useState(false);
  const outer = useSidebar();
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  return (
    <div
      data-panels
      className="relative flex min-h-0 flex-1 flex-col bg-[color-mix(in_oklab,var(--background)_80%,black)] dark:bg-black"
    >
      <TopBar />
      <div className="relative flex min-h-0 flex-1 pb-2 pe-2">
        {/* Its own sidebar state, so the compact rail never collapses
            Sidebar's nav. The title bar's toggle still drives it when
            there is room; the no-op keeps Ctrl+B from toggling twice.
            The dial reads this state, so its tip waits while it's hidden. */}
        <SidebarProvider
          open={!compact && outer.open}
          onOpenChange={noop}
          className="min-h-0 w-auto shrink-0"
          style={
            {
              "--sidebar-width": `${sidebarWidth}px`,
              "--sidebar-width-icon": "3.5rem",
            } as React.CSSProperties
          }
        >
          <DialSlot.Provider value={dial}>{nav}</DialSlot.Provider>
        </SidebarProvider>
        <div
          className={cn(
            "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            PANEL,
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[260px] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]"
          >
            <BackgroundCover />
          </div>
          <EntityPageHeader />
          <RouteHeaderSlot className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>*]:pointer-events-auto" />
          {page}
        </div>
        {!compact ? (
          <NowPlayingPanel className="ms-2" />
        ) : (
          nowOpen && (
            <NowPlayingPanel className="absolute bottom-2 end-2 top-0 z-30 shadow-[0_12px_40px_-12px_var(--k550)]" />
          )
        )}
      </div>
      <div className="ps-2">
        <PlayerBarBottom
          extra={
            <>
              <PopOutButton hasTrack={hasTrack} />
              {compact && (
                <NowPlayingToggle
                  open={nowOpen}
                  onToggle={() => setNowOpen((v) => !v)}
                />
              )}
            </>
          }
        />
      </div>
    </div>
  );
}
