---
name: run-app
description: Launch the YTubic Plus desktop app in dev mode on Windows and drive it (click, read state, screenshot) through WebView2's debug port. Use to check a change in the real app, not just tests.
---

# Run the app

## Launch

1. Close any running YTubic or YTubic Plus first, including from the tray. They share the
   app id, so the single-instance plugin hands a new launch to the old window and exits.
   Check with `Get-Process | ? ProcessName -match ytubic`.
2. Needs `pnpm` 10.33.1 on PATH (`npm i -g pnpm@10.33.1`; Node 26 has no corepack).
   Tauri's `beforeDevCommand` runs `pnpm dev` through cmd.
3. Start it in the background from the repo root (Bash):

   ```bash
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" pnpm tauri dev
   ```

4. Wait until `curl -s http://127.0.0.1:9222/json/version` answers. The first Rust build
   takes a few minutes; later ones are quick.

The dev build uses the same app data as the installed app, so it is signed in and keeps
the user's settings. Put back any setting you change.

## Drive

`cdp.mjs` (next to this file) talks to the main window over CDP, using Node's built-in
WebSocket, with no extra installs:

```bash
node .claude/skills/run-app/cdp.mjs eval "document.title"
node .claude/skills/run-app/cdp.mjs shot out.png    # then Read the png and look at it
```

- Click through the DOM: find by text or `aria-label` and `.click()`. Settings rows use
  `aria-label` equal to their title, e.g. `[aria-label="Lyrics in Player"]`.
- Close dialogs with
  `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`.
- The window is not focused while you drive it, so `navigator.clipboard.writeText`
  fails. To see what a copy button copies, replace `navigator.clipboard.writeText` with
  a function that records its argument.
- The OS window title (set from Rust) is not `document.title`. Read it with
  `Get-Process ytubic | Select MainWindowTitle`.
- `ytubic-plus://` links only open once an installed build has registered the scheme.

Stop the background task when done, or tell the user it is still running. Stopping the
task can leave Vite's node process holding port 1420 ("Port 1420 is already in use" on
the next launch); find it with `Get-NetTCPConnection -LocalPort 1420` and stop that PID.
