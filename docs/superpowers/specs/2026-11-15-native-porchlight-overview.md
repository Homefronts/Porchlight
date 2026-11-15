# Native Porchlight: overview

Date: 2026-11-15. Decided with the user in conversation; each project below gets its own design before it is built.

## Why

- Elgato Wave Link (and anything else that routes audio per app) can't capture Porchlight: WebView2 plays the music from `msedgewebview2.exe`, not `porchlight.exe`.
- The user doesn't want Porchlight to be a web browser underneath. Today it runs two WebView2 process trees: the app's, and a hidden session keeper (`src-tauri/src/lib.rs:1361`) that stays open with music.youtube.com loaded.

## What success looks like

Porchlight is one native process tree. Wave Link and Windows' volume mixer see "Porchlight" as the audio source. Every screen, look and layout of today's app exists natively and looks as good or better. It ships first as a **Beta** to current YTubic and Porchlight users, and only when it is as polished as possible.

## Decisions

- **Platforms:** Windows and Linux. macOS is dropped. Linux is tested on the Windows PC through WSL (installed later, when there's a Linux build).
- **Toolkit:** Slint (Rust, GPLv3 like Porchlight). Rejected: iced (custom styling and animation take much more hand-written code), Qt via Rust bindings (heavy C++ toolchain, youngest and most fiddly layer), WinUI 3 (Windows only).
- **Sign-in:** Google sign-in still needs a small web view, opened only while signing in. Nothing else uses a web engine; keeping the session alive must not need a resident hidden browser.
- **Languages:** the parked app-languages work carries over. Slint screens take their text from `src/locales/*.json`; translations are written once the Slint screens are finished.
- **Existing Rust carries over:** downloads, Discord, Last.fm/Libre.fm/ListenBrainz, taskbar buttons, tray, updates, migration.

## Order (three projects, each designed and built in turn)

1. **Native audio engine.** Rust plays the music in `porchlight.exe`; the current web UI drives it through Tauri commands and events. Fixes Wave Link early, and the native app needs this engine anyway.
2. **YouTube Music client in Rust.** Everything in `src/lib/innertube` (about 5,400 lines) and the stores that call it.
3. **Slint interface,** screen by screen. The web UI keeps working until the Slint app covers everything; then the Slint app ships as the Beta.

## Non-goals for now

- Rewriting features while porting them. The native app matches today's behaviour first; improvements come after.
- macOS.
