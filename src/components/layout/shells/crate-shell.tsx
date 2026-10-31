import { useLayoutEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useShellInsets } from "./insets";
import { RouteHeaderSlot } from "./route-header-slot";
import { useCompact } from "./panels/parts";
import { BrowseTabs, MenuButton, Wordmark } from "./index/parts";
import { Turntable } from "./crate/parts";
import type { ShellProps } from "./types";

/**
 * A record crate: logo and dial, the tabs and the MENU (playlists,
 * Settings, account) across the top, the stage (Home draws the crate
 * itself, see crate/parts.tsx; every other page renders as usual), and
 * the turntable along the bottom. Below Panels' breakpoint the tabs drop
 * to their own row, the crate shows two sleeves and the deck loses Up Next.
 */
export function CrateShell({ page, dial }: ShellProps) {
  const compact = useCompact();
  // Overlays sit 1rem above the turntable, whatever height it settles at.
  const deckRef = useRef<HTMLDivElement>(null);
  const [deckH, setDeckH] = useState(0);
  useLayoutEffect(() => {
    const el = deckRef.current!;
    const measure = () => setDeckH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useShellInsets({ left: "1rem", bottom: `${deckH + 16}px`, right: "1rem" });
  return (
    <div data-crate className="relative flex min-h-0 flex-1 flex-col">
      <TopBar sidebarToggle={false} />
      <div className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-2 border-b border-w110 px-7 pb-2.5 pt-1">
        <Wordmark dial={dial} />
        <BrowseTabs className={compact ? "order-last basis-full" : undefined} />
        <MenuButton />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <EntityPageHeader />
        <RouteHeaderSlot className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>*]:pointer-events-auto" />
        {page}
      </div>
      <TooltipProvider delayDuration={800} skipDelayDuration={0}>
        <Turntable ref={deckRef} compact={compact} />
      </TooltipProvider>
    </div>
  );
}
