import { TopBar } from "@/components/layout/top-bar";
import { PlayerBar } from "@/components/layout/player-bar";
import { PlayerBarBottom } from "@/components/layout/player-bar-bottom";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import {
  PlayerResizeHandle,
  SidebarResizeHandle,
} from "@/components/layout/layout-resize-handle";
import { useSidebar } from "@/components/ui/sidebar";
import { useLayoutStore } from "@/lib/store/layout";
import { sidebarInsets, useShellInsets } from "./insets";
import { RouteHeaderSlot } from "./route-header-slot";
import type { ShellProps } from "./types";

/** Today's arrangement: title bar, nav column, page, and the player by mode. */
export function SidebarShell({ page, nav, hasTrack }: ShellProps) {
  const mode = useLayoutStore((s) => s.mode);
  useShellInsets(sidebarInsets(mode, useSidebar().state === "collapsed"));
  return (
    <>
      {/* Custom title bar spans the full window width so the
          Windows-style min/max/close buttons land in the actual
          top-right corner, not behind the floating player. */}
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        {nav}
        <SidebarResizeHandle />
        {/* In `right` mode we reserve 23rem on the right for the
            floating player card — but only when a track is
            actually loaded; the empty state shouldn't carve out
            dead space. `bottom` and `floating` follow the same
            "hide when no track" rule. */}
        <div
          className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col"
          style={
            mode === "right" && hasTrack
              ? { paddingRight: "calc(var(--player-width) + 1rem)" }
              : undefined
          }
        >
          {/* Route entity header (playlist / album / artist).
              An absolute overlay outside the scroll flow. <main>
              always reserves the expanded height as padding, keeping
              content movement exactly aligned with scrollTop. */}
          {/* The wrapper is the header's positioning context. It
              sits INSIDE the column's conditional right padding
              (the reserved player-card slot) — anchoring the
              absolute header to the column itself would stretch it
              across the padding box, under the player card. */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <EntityPageHeader />
            {/* Slot for a route's own pinned header (Home portals
                its title row here). Outside the scroller for the
                same reason the entity header is: the route masks
                the scroller's top edge so content dissolves under
                the header, and a header inside the scroller would
                dissolve with it. */}
            <RouteHeaderSlot className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>*]:pointer-events-auto" />
            {/* The app scroller, kept across shells (see AppShell). */}
            {page}
          </div>
          {mode === "bottom" && hasTrack && <PlayerBarBottom />}
        </div>
        {mode === "right" && hasTrack && <PlayerBar />}
        {mode === "right" && hasTrack && <PlayerResizeHandle />}
      </div>
    </>
  );
}
