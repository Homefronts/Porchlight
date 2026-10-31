import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { PlayerBarBottom } from "@/components/layout/player-bar-bottom";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import { BackgroundCover } from "@/components/layout/background-cover";
import { useLayoutStore } from "@/lib/store/layout";
import { cn } from "@/lib/utils";
import { DialSlot } from "./dial-slot";
import { useShellInsets } from "./insets";
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

  // Overlays sit 8px above the bar (its wrapper already carries the 8px
  // under it) and, at full width, clear the Now playing panel and its gap.
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(0);
  useLayoutEffect(() => {
    const el = barRef.current!;
    const measure = () => setBarH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const navOpen = !compact && outer.open;
  useShellInsets({
    // The nav cell: its width when open, the rail (3.5rem + its 1rem padding) when not.
    left: navOpen ? `${sidebarWidth}px` : "4.5rem",
    bottom: `${barH + 16}px`,
    right: compact ? "1rem" : "calc(270px + 1.5rem)",
  });

  // The compact overlay folds away on Escape and when the page changes.
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => setNowOpen(false), [pathname]);
  useEffect(() => {
    if (!nowOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNowOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nowOpen]);

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
          open={navOpen}
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
      <div ref={barRef} className="ps-2 [&>aside]:border-w110">
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
