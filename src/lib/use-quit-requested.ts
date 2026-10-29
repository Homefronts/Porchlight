import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { flushPlaybackSave } from "@/lib/store/playback";

/**
 * Mount once. Quits that start in Rust (tray Quit, window close) ask first so
 * the song and position are saved; Rust force-exits after 2.5 s regardless.
 */
export function useQuitRequested(): void {
  useEffect(() => {
    const un = listen("quit-requested", () => {
      flushPlaybackSave();
      void invoke("quit_app");
    });
    return () => void un.then((f) => f());
  }, []);
}
