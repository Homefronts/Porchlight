import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { TopBar } from "@/components/layout/top-bar";
import { PlayerBar } from "@/components/layout/player-bar";
import { PlayerBarBottom } from "@/components/layout/player-bar-bottom";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import {
  PlayerResizeHandle,
  SidebarResizeHandle,
} from "@/components/layout/layout-resize-handle";
import { useEntityHeaderStore } from "@/lib/store/entity-header";
import { useLayoutStore } from "@/lib/store/layout";
import type { ShellProps } from "./types";

/** Today's arrangement: title bar, nav column, page, and the player by mode. */
export function SidebarShell({ page, nav, hasTrack }: ShellProps) {
  const mode = useLayoutStore((s) => s.mode);
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
            <div
              data-route-header-slot
              className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>*]:pointer-events-auto"
            />
            {/* Plain scroller — NOT Radix ScrollArea. Radix wraps the
                content in `display: table; min-width: 100%` which grows
                to intrinsic width and defeats any nested `overflow-x`
                (our horizontal carousels would never clip). */}
            <EntityScroller>{page}</EntityScroller>
          </div>
          {mode === "bottom" && hasTrack && <PlayerBarBottom />}
        </div>
        {mode === "right" && hasTrack && <PlayerBar />}
        {mode === "right" && hasTrack && <PlayerResizeHandle />}
      </div>
    </>
  );
}

/**
 * The shared app scroller. Reserves the entity header's expanded
 * height as padding-top whenever a route publishes a header config —
 * the header itself is an absolute overlay (see EntityPageHeader), so
 * this padding is the only thing keeping content below it. Isolated
 * in its own component so the padding-top updates don't re-render the
 * whole shell.
 */
export function EntityScroller({ children }: { children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const headerPad = useEntityHeaderStore((s) =>
    s.config ? s.headerHeight : 0,
  );

  // Single shared scroller for the whole app — reset to top whenever the
  // route changes so opening a playlist (or any other page) doesn't land
  // on whatever scrollTop the previous page happened to leave behind.
  const pathname = useLocation({ select: (loc) => loc.pathname });
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [pathname]);

  // Width of the scrollbar track `scrollbar-gutter: stable` reserves (see
  // index.css). It's whatever the platform draws — 0 on overlay-scrollbar
  // systems — so it is measured rather than assumed, and published as a
  // custom property for the content's compensating negative margin.
  const [gutter, setGutter] = useState(0);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    // The gutter is constant once reserved; the observer only exists to
    // catch a zoom or display change swapping the scrollbar metrics.
    const measure = () => setGutter(el.offsetWidth - el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <main
      ref={mainRef}
      className="app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      style={{ "--scroller-gutter": `${gutter}px` } as React.CSSProperties}
    >
      <div className="app-scroll-content" style={{ paddingTop: headerPad }}>
        {children}
      </div>
    </main>
  );
}
