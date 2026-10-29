import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { pickThumbnail } from "@/components/shared/thumbnail";
import { firstName } from "@/lib/greeting";
import { HOME_KEY, type HomeFeedPage } from "@/lib/innertube/home";
import { libraryPlaylistsQuery } from "@/lib/innertube/library";
import type { Thumbnail } from "@/lib/innertube/types";
import { useAccounts } from "@/lib/store/accounts";
import { authLoggedInQuery } from "@/lib/store/auth-queries";
import { currentTrack, usePlaybackStore } from "@/lib/store/playback";
import { paletteInUse } from "@/lib/theme/edit";
import { continuePicker, isUpdater, skipPicker, skipsWelcome } from "@/lib/theme/first-launch";
import { FONT_STACKS, type Look } from "@/lib/theme/looks";
import { activeLook, useThemeStore } from "@/lib/theme/store";
import { LookEditor, type LookEditorValue } from "./look-editor";
import { LookPreview, placeholderSample, type PreviewSample } from "./look-preview";
import { Welcome } from "./welcome";

const art = (t: Thumbnail[]) => pickThumbnail(t, 256) ?? "";

/**
 * The preview's content: the signed-in library from caches the app already
 * fills (home feed, sidebar playlists, the queue), else placeholders. Gaps
 * are filled from the placeholders too.
 */
export function usePreviewSample(look: Look): PreviewSample {
  const qc = useQueryClient();
  const loggedIn = useQuery(authLoggedInQuery).data === true;
  const library = useQuery(libraryPlaylistsQuery(loggedIn)).data;
  const name = firstName(useAccounts().data?.find((a) => a.isActive)?.name);
  // Read-only view of Home's cache: never fetches the feed on its own.
  const home = useSyncExternalStore(
    (cb) => qc.getQueryCache().subscribe(cb),
    () => qc.getQueryData<InfiniteData<HomeFeedPage>>(HOME_KEY),
  );
  const track = usePlaybackStore(currentTrack);

  const base = placeholderSample(look);
  if (!loggedIn) return base;
  const shelves = home?.pages.flatMap((p) => p.shelves) ?? [];
  const shelf = shelves.find((s) => /listen again/i.test(s.title)) ?? shelves[0];
  const covers = (shelf?.items ?? []).map((i) => art(i.thumbnails)).filter(Boolean);
  const playlists = (library ?? []).flatMap((s) => s.items.map((i) => i.title));
  return {
    name: name || base.name,
    covers: [...covers, ...base.covers].slice(0, base.covers.length),
    playlists: playlists.length ? playlists : base.playlists,
    nowPlaying: track
      ? {
          title: track.title,
          artist: track.artists?.map((a) => a.name).join(", ") ?? track.subtitle ?? "",
          cover: art(track.thumbnails),
        }
      : base.nowPlaying,
  };
}

/**
 * The once-only first launch: the Welcome, then a full-window look picker.
 * A modal dialog so it covers every bit of app chrome, traps focus and keeps
 * the title-bar drag strip and window controls working (see top-bar.tsx).
 */
export function MakeItYours() {
  const [updater] = useState(() => isUpdater(useThemeStore.getState().activeId));
  const [stage, setStage] = useState<"welcome" | "pick">("welcome");
  const [start] = useState<LookEditorValue>(() => {
    const s = useThemeStore.getState();
    return { look: activeLook(s), layout: s.layout };
  });
  const [value, setValue] = useState(start);
  const { resolvedTheme, forcedTheme } = useTheme();
  // As the editor shows it: Classic in the light or dark mode in use.
  const look = paletteInUse(value.look, (forcedTheme ?? resolvedTheme) === "light" ? "light" : "dark");
  const sample = usePreviewSample(look);
  const contentRef = useRef<HTMLDivElement>(null);
  const toPicker = useCallback(() => setStage("pick"), []);

  // The Skip button goes with the Welcome; keep focus on the screen.
  useEffect(() => {
    if (stage === "pick") contentRef.current?.focus();
  }, [stage]);

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          // Focus the screen, not Skip: focus on Skip pauses the Welcome.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            if (stage === "welcome") toPicker();
            else skipPicker();
          }}
          onKeyDown={(e) => {
            if (stage !== "welcome" || !skipsWelcome(e)) return;
            // Enter / Space on Skip press it the normal way.
            if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) return;
            // Handled here so the key never reaches the app's shortcuts.
            e.preventDefault();
            toPicker();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 bg-background text-foreground outline-none"
        >
          {stage === "welcome" ? (
            <Welcome updater={updater} onDone={toPicker} />
          ) : (
            <div className="grid h-full animate-in fade-in-0 duration-500 grid-cols-[minmax(360px,420px)_1fr]">
              {/* pt-12 clears the title bar's drag strip, which sits on top. */}
              <div className="flex min-h-0 flex-col border-r border-border">
                <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-12 pb-4">
                  <DialogPrimitive.Title
                    className="text-[40px] font-normal leading-none"
                    style={{ fontFamily: FONT_STACKS["instrument-serif"] }}
                  >
                    Make it yours.
                  </DialogPrimitive.Title>
                  <p className="mt-1.5 text-[13px] text-t6">
                    Pick a starting point. You can change any of this later in Settings &gt; Appearance.
                  </p>
                  <LookEditor value={value} onChange={setValue} />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border px-7 py-4">
                  <span className="text-xs text-t6">Esc skips and keeps {start.look.name}</span>
                  <Button className="rounded-full px-5" onClick={() => continuePicker(value)}>
                    Continue
                  </Button>
                </div>
              </div>
              <div className="relative flex min-w-0 items-center justify-center bg-card p-10">
                <span
                  className="absolute left-5 top-12 text-[11px] tracking-[0.1em] text-t10"
                  style={{ fontFamily: FONT_STACKS["jetbrains-mono"] }}
                >
                  LIVE PREVIEW
                </span>
                <div className="w-full max-w-[760px] shadow-2xl">
                  <LookPreview look={look} layout={value.layout} sample={sample} />
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
