import { TopBar } from "@/components/layout/top-bar";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useShellInsets } from "./insets";
import { RouteHeaderSlot } from "./route-header-slot";
import { useCompact } from "./compact";
import { BrowseTabs, MenuButton } from "./index/parts";
import { RecordPage } from "./gatefold/parts";
import type { ShellProps } from "./types";

/**
 * An open double LP. The left page is always the playing record, with the
 * logo and dial in its corner; the right page holds the tabs, the MENU
 * (playlists, Settings, account) and the page. Below Panels' breakpoint
 * the left page slims to a column and its lyrics fold behind a button.
 */
export function GatefoldShell({ page, dial, hasTrack }: ShellProps) {
  const compact = useCompact();
  // Overlays stay on the right page, clear of the record.
  useShellInsets({ left: compact ? "210px" : "50vw", bottom: "1rem", right: "1rem" });
  return (
    <div data-gatefold className="relative flex min-h-0 flex-1 flex-col">
      <TopBar sidebarToggle={false} />
      <div className="relative flex min-h-0 flex-1">
        <TooltipProvider delayDuration={800} skipDelayDuration={0}>
          <RecordPage hasTrack={hasTrack} compact={compact} dial={dial} />
        </TooltipProvider>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-w110 px-6 pb-2.5 pt-1">
            <BrowseTabs />
            <MenuButton />
          </div>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <EntityPageHeader />
            <RouteHeaderSlot className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>*]:pointer-events-auto" />
            {page}
          </div>
        </div>
      </div>
    </div>
  );
}
