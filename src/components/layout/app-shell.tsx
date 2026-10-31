import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { FloatingPlayerSync } from "@/components/layout/floating-player-sync";
import { DragSnapOverlay } from "@/components/layout/drag-snap-overlay";
import { WindowResizeHandles } from "@/components/layout/window-resize-handles";
import { IS_MAC } from "@/lib/platform";
import { noop } from "@/lib/utils";
import { useEntityHeaderStore } from "@/lib/store/entity-header";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { PremiumGateDialog } from "@/components/layout/premium-gate-dialog";
import { ChannelPickerDialog } from "@/components/layout/channel-picker-dialog";
import { MoveNotice } from "@/components/layout/move-notice";
import { WhatsNewDialog } from "@/components/layout/whats-new-dialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAudioEngine } from "@/lib/audio-engine";
import { FullscreenPlayer } from "@/components/layout/fullscreen-player";
import { useCacheAutoClean } from "@/lib/cache-cleanup";
import { usePlaybackNotifications } from "@/lib/playback-notifications";
import { useLastfmScrobbler } from "@/lib/lastfm-scrobbler";
import { useRewindLogger } from "@/lib/rewind/use-rewind-logger";
import { useRewindScheduler } from "@/lib/rewind/seal";
import { useVideoModeFollower } from "@/lib/video-mode";
import { useYtdlpSetup } from "@/lib/ytdlp";
import { useDownloadsBridge } from "@/lib/downloads";
import { useDownloadsSync } from "@/lib/downloads-sync";
import { useAiDataSync } from "@/lib/ai/data";
import { useUpdateStartupCheck } from "@/lib/updater";
import { useQuitRequested } from "@/lib/use-quit-requested";
import { useDeepLinks } from "@/lib/use-deep-links";
import { useWhatsNewOnUpdate } from "@/lib/store/whats-new";
import { usePlaybackStore } from "@/lib/store/playback";
import { BackgroundCover } from "@/components/layout/background-cover";
import { useLayoutStore } from "@/lib/store/layout";
import { usePremiumStatusSync } from "@/lib/store/premium";
import {
  useCloseBehaviorSync,
  useDiscordPresenceSync,
  useSettingsStore,
} from "@/lib/store/settings";
import {
  useAccountMetaBackfill,
  useAccountsChangedListener,
  useLoginSuccessListener,
  useSessionRefreshedListener,
} from "@/lib/store/accounts";
import { CLASSIC_ID } from "@/lib/theme/looks";
import { useActiveLook, useThemeStore } from "@/lib/theme/store";
import { MakeItYours } from "@/components/theme/make-it-yours";
import { useSessionStatusListener } from "@/lib/store/session-status";
import { shellFor } from "@/components/layout/shells";
import { usePersistentPage } from "@/components/layout/shells/persistent-page";
import { RouteHeaderSlotProvider } from "@/components/layout/shells/route-header-slot";
import { TurntableDial } from "@/components/theme/turntable-dial";
import { cycleOnKey, LayoutNameCard } from "@/components/theme/layout-flip";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (cycleOnKey(e)) {
        e.preventDefault();
        return;
      }
      if (isEditableTarget(e.target)) return;
      // Space toggles playback — but only when focus is NOT on an
      // interactive control, so a button/link the user tabbed to still
      // activates on Space. (Tab is no longer blocked window-wide; that
      // previously killed all keyboard navigation, including in dialogs.)
      if (e.key === " " || e.code === "Space") {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target as HTMLElement | null;
        if (t?.closest("button, a, [role='button'], [tabindex]")) return;
        e.preventDefault();
        usePlaybackStore.getState().toggle();
      }
    };
    // On window blur (e.g. Alt+Tab away) drop focus from whatever control
    // was last clicked, so returning to the app doesn't leave a "ghost"
    // focused button that Space/Enter would re-trigger.
    const onWindowBlur = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && !isEditableTarget(el)) el.blur?.();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  useAudioEngine();
  useYtdlpSetup();
  useDownloadsBridge();
  useDownloadsSync();
  useAiDataSync();
  useUpdateStartupCheck();
  useQuitRequested();
  useWhatsNewOnUpdate();
  useDeepLinks();
  usePremiumStatusSync();
  useLoginSuccessListener();
  useAccountsChangedListener();
  useSessionRefreshedListener();
  useSessionStatusListener();
  useAccountMetaBackfill();
  useGlobalShortcuts();
  useCloseBehaviorSync();
  useDiscordPresenceSync();
  useCacheAutoClean();
  usePlaybackNotifications();
  useLastfmScrobbler();
  useRewindLogger();
  useRewindScheduler();
  useVideoModeFollower();
  const mode = useLayoutStore((s) => s.mode);
  const setMode = useLayoutStore((s) => s.setMode);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const playerWidth = useLayoutStore((s) => s.playerWidth);
  const background = useSettingsStore((s) => s.background);
  const look = useActiveLook();
  const pickerSeen = useThemeStore((s) => s.pickerSeen);
  // The player UI is hidden whenever there's no active track —
  // covers the "Nothing playing" empty state at first launch and
  // after the queue is cleared. The mode itself stays the same; the
  // player just reappears in the chosen slot once a track is loaded.
  const hasTrack = usePlaybackStore(
    (s) => s.index >= 0 && s.index < s.queue.length,
  );
  // Set when we close the floating window programmatically (queue emptied)
  // so the player-window-closed handler doesn't mistake it for the user
  // clicking X and revert the persisted floating layout preference.
  const suppressRevertRef = useRef(false);

  const layout = useThemeStore((s) => s.layout);
  const Shell = shellFor(layout);
  // The scroller travels with the page, so a shell swap keeps its scroll
  // position and the element pages cache (TrackList, Home's fade).
  const { page, portal } = usePersistentPage(
    <EntityScroller>{children}</EntityScroller>,
  );

  // Open / close the floating player window. We only spawn it when
  // there's actually something to show — at first launch with mode
  // persisted as "floating", an empty "Nothing playing" window is
  // wasted real estate. As soon as a track is queued, this effect
  // re-fires (because `hasTrack` flipped) and the window pops up.
  useEffect(() => {
    if (mode === "floating" && hasTrack) {
      void invoke("open_player_window").catch((e) => {
        console.error("[layout] open_player_window failed:", e);
      });
    } else {
      // Closing only because the queue emptied (mode is still "floating")
      // is a programmatic hide, not the user leaving floating mode — mark
      // it so the close handler doesn't revert the layout to "right".
      if (mode === "floating" && !hasTrack) suppressRevertRef.current = true;
      void invoke("close_player_window").catch(() => {
        /* no window — fine */
      });
    }
  }, [mode, hasTrack]);

  // When the user closes the floating window with its X button, revert
  // to the side-card layout. The Rust window-event handler emits
  // `player-window-closed` from the `on_window_event` for label "player".
  // The `cancelled` flag protects against React StrictMode's
  // mount/unmount/remount cycle leaking duplicate listeners.
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void listen("player-window-closed", () => {
      // Skip the revert when WE closed the window programmatically (queue
      // emptied) rather than the user clicking X.
      if (suppressRevertRef.current) {
        suppressRevertRef.current = false;
        return;
      }
      // Only flip if we're still in floating mode — guard against
      // races where the user already switched the mode themselves
      // (which closed the window first, triggering this event).
      if (useLayoutStore.getState().mode === "floating") {
        setMode("right");
      }
    }).then((un) => {
      if (cancelled) un();
      else dispose = un;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [setMode]);

  // Cross-window navigation: links inside the floating player window
  // can't use the router (no router there), so they emit Tauri events
  // and we handle navigation here.
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const disposers: (() => void)[] = [];
    const bind = <T,>(event: string, run: (payload: T) => void) => {
      void listen<T>(event, (e) => run(e.payload)).then((un) => {
        if (cancelled) un();
        else disposers.push(un);
      });
    };
    bind<{ id: string }>("nav:artist", ({ id }) =>
      navigate({ to: "/artist/$id", params: { id } }),
    );
    bind<{ id: string }>("nav:album", ({ id }) =>
      navigate({ to: "/album/$id", params: { id } }),
    );
    return () => {
      cancelled = true;
      for (const un of disposers) un();
    };
  }, [navigate]);

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={0}>
      <SidebarProvider
        // Sidebar's nav, which Panels' rail follows. Elsewhere it's hidden, so
        // Ctrl+B mustn't quietly collapse it for the way back.
        onOpenChange={layout === "sidebar" || layout === "panels" ? undefined : noop}
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
            "--sidebar-width-icon": "3.5rem",
            "--player-width": `${playerWidth}px`,
          } as React.CSSProperties
        }
      >
        <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background">
          {background === "ambient" && look.id === CLASSIC_ID && (
            <BackgroundCover />
          )}
          <RouteHeaderSlotProvider>
            {/* What the layout flip turns over; the page inside only moves. */}
            <div data-layout-flip className="flex min-h-0 flex-1 flex-col">
              <Shell
                page={page}
                nav={<AppSidebar />}
                dial={<TurntableDial />}
                hasTrack={hasTrack}
              />
            </div>
            {/* After the shell, so the page node is in place first. */}
            {portal}
          </RouteHeaderSlotProvider>
          {mode === "floating" && hasTrack && <FloatingPlayerSync />}
          <DragSnapOverlay />
          <FullscreenPlayer />
          <WindowResizeHandles disabled={IS_MAC} />
          <SettingsDialog />
          <PremiumGateDialog />
          <ChannelPickerDialog />
          {/* What's New waits until the first-launch picker is done. */}
          {pickerSeen ? <WhatsNewDialog /> : <MakeItYours />}
        </div>
      </SidebarProvider>
      <LayoutNameCard />
      <MoveNotice ready={pickerSeen} />
      <Toaster />
    </TooltipProvider>
  );
}

/**
 * The shared app scroller. Reserves the entity header's expanded
 * height as padding-top whenever a route publishes a header config —
 * the header itself is an absolute overlay (see EntityPageHeader), so
 * this padding is the only thing keeping content below it. Isolated
 * in its own component so the padding-top updates don't re-render the
 * whole AppShell.
 */
function EntityScroller({ children }: { children: ReactNode }) {
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

  // Plain scroller — NOT Radix ScrollArea. Radix wraps the content in
  // `display: table; min-width: 100%` which grows to intrinsic width and
  // defeats any nested `overflow-x` (our horizontal carousels would never
  // clip).
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
