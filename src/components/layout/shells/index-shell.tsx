import { TopBar } from "@/components/layout/top-bar";
import { EntityPageHeader } from "@/components/layout/entity-page-header";
import { useShellInsets } from "./insets";
import { RouteHeaderSlot } from "./route-header-slot";
import { useCompact } from "./compact";
import { Appendix, IndexMasthead } from "./index/parts";
import { IndexStrip } from "./index/strip";
import type { ShellProps } from "./types";

/**
 * A magazine: the cassette-label player across the top, the masthead with
 * the tabs, the page, and the Appendix (playlists, Settings) on the right.
 * No sidebar. Below Panels' breakpoint the Appendix folds into a MENU
 * button, the tabs drop to their own row and the strip loses its times.
 */
export function IndexShell({ page, hasTrack }: ShellProps) {
  const compact = useCompact();
  // No left or bottom chrome; overlays only clear the Appendix.
  useShellInsets({
    left: "1rem",
    bottom: "1rem",
    right: compact ? "1rem" : "calc(260px + 1rem)",
  });
  return (
    <div data-index-layout className="relative flex min-h-0 flex-1 flex-col">
      <TopBar sidebarToggle={false} />
      <IndexStrip hasTrack={hasTrack} compact={compact} />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <IndexMasthead compact={compact} />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <EntityPageHeader />
            <RouteHeaderSlot className="pointer-events-none absolute inset-x-0 top-0 z-20 [&>*]:pointer-events-auto" />
            {page}
          </div>
        </div>
        {!compact && <Appendix />}
      </div>
    </div>
  );
}
