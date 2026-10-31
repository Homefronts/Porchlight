import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { IconMenu2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  LIKED_ID,
  NAV_ITEMS,
  usePlaylistRows,
  UserProfile,
} from "@/components/layout/app-sidebar";
import { isLinerLook } from "@/lib/theme/looks";
import { useActiveLook } from "@/lib/theme/store";
import { openSettings } from "@/lib/store/settings-dialog";
import { sideLetter } from "@/components/theme/section-label";
import { cn } from "@/lib/utils";

const noop = () => {};
const EYEBROW = "font-meta text-[11px] uppercase tracking-[0.1em] text-muted-foreground/70";

/**
 * The logo with the dial beside it. The dial reads "expanded" from the
 * nearest sidebar state to time its tip; here it is always on screen, so
 * it gets its own state that is always open.
 */
export function Wordmark({ dial }: { dial: ReactNode }) {
  const liner = isLinerLook(useActiveLook());
  return (
    <div className="flex items-center gap-[9px]">
      <img src="/ytubic-icon.svg" alt="Porchlight" className="size-7 shrink-0 rounded-full" />
      {liner ? (
        <span className="font-display text-[15px] font-black uppercase leading-[0.92] tracking-[-0.01em] text-t1">
          Porch
          <br />
          Light<i className="not-italic text-acc1">.</i>
        </span>
      ) : (
        <span className="font-headline text-[17px] font-semibold leading-none tracking-[-0.015em] text-t1">
          Porchlight
        </span>
      )}
      <SidebarProvider open onOpenChange={noop} className="ms-1 min-h-0 w-auto">
        {dial}
      </SidebarProvider>
    </div>
  );
}

/** Every top-level screen as mono tabs, Downloads included. */
export function BrowseTabs({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Browse"
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1 font-meta text-[11px] uppercase tracking-[0.12em]",
        className,
      )}
    >
      {NAV_ITEMS.map(({ to, label }) => {
        // A shelf page is part of Home's contents.
        const on = pathname === to || (to === "/" && pathname.startsWith("/shelf/"));
        return (
          <Link
            key={to}
            to={to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "border-b-2 py-1 transition-colors hover:text-foreground",
              on ? "border-acc1 text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Logo, dial and the tabs. */
export function IndexMasthead({
  dial,
  compact,
}: {
  dial: ReactNode;
  compact: boolean;
}) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-w110 px-6 pb-2.5 pt-3"
    >
      <Wordmark dial={dial} />
      <BrowseTabs className={compact ? "order-last basis-full" : "ms-auto"} />
      {compact && <MenuButton />}
    </div>
  );
}

function Playlists({ onPick }: { onPick?: () => void }) {
  const rows = usePlaylistRows();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const row = (id: string, title: string, mark: string) => (
    <li key={id}>
      <Link
        to="/playlist/$id"
        params={{ id }}
        onClick={onPick}
        className={cn(
          "flex justify-between gap-3 border-b border-dotted border-w110 py-1 hover:text-foreground",
          pathname === `/playlist/${id}` ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{title}</span>
        <span className="shrink-0 text-muted-foreground/70">{mark}</span>
      </Link>
    </li>
  );
  return (
    <ul>
      {row(LIKED_ID, "Liked songs", "♥")}
      {rows.map((p, i) => row(p.id, p.title, sideLetter(i)))}
    </ul>
  );
}

function SettingsLink({ onPick }: { onPick?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onPick?.();
        openSettings();
      }}
      className="flex w-full justify-between py-1 text-start uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground"
    >
      <span>Settings</span>
      <span aria-hidden>▸</span>
    </button>
  );
}

/**
 * The account button (sign in, switch, sign out) from the sidebar's foot.
 * Its menu button reads sidebar state, so it gets an always-open one.
 */
function Account() {
  return (
    <SidebarProvider open onOpenChange={noop} className="min-h-0">
      <UserProfile />
    </SidebarProvider>
  );
}

/** The right column: playlists, Settings, then the account. */
export function Appendix() {
  return (
    <aside
      aria-label="Appendix"
      className="app-scroll flex w-[260px] shrink-0 flex-col overflow-y-auto border-s border-w110 px-[22px] py-6"
    >
      <div className="font-meta text-xs">
        <div className={cn(EYEBROW, "mb-2")}>Appendix · Playlists</div>
        <Playlists />
        <div className={cn(EYEBROW, "mb-2 mt-[22px]")}>Porchlight</div>
        <SettingsLink />
      </div>
      <div className="mt-auto pt-6">
        <Account />
      </div>
    </aside>
  );
}

/** Compact: the appendix folds into a MENU button. Gatefold keeps it at every width. */
export function MenuButton() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="ms-auto font-meta text-[11px] tracking-[0.12em]">
          <IconMenu2 />
          MENU
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="app-scroll max-h-[70vh] w-[240px] overflow-y-auto">
        <div className="font-meta text-xs">
          <div className={cn(EYEBROW, "mb-2")}>Playlists</div>
          <Playlists onPick={close} />
          <div className={cn(EYEBROW, "mb-2 mt-4")}>Porchlight</div>
          <SettingsLink onPick={close} />
        </div>
        <div className="mt-4">
          <Account />
        </div>
      </PopoverContent>
    </Popover>
  );
}
