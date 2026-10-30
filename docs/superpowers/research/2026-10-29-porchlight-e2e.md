# Porchlight end-to-end test (Windows)

Date: 2026-10-29/30. Machine: the user's Windows 11 Pro 10.0.26200 PC, using the user's real YTubic Plus 0.9.0 install (custom dir `C:\Users\sdand\Desktop\YTubic`) and real data (signed-in account, 354 downloaded files / 649 MB).

Builds, both local and unsigned, made with `pnpm tauri build --bundles nsis` and `createUpdaterArtifacts: false`:
- `YTubic_0.9.1_x64-setup.exe` from `42406eb` (the bridge)
- `Porchlight_1.0.0_x64-setup.exe` from `164b14c`

The installers were run directly with the flags the updater uses (`/S /UPDATE`). The updater's download and signature check were not part of this test.

Safety: before anything ran, both real data folders were copied in full to `C:\Users\sdand\YTubicBackup-e2e-2026-10-29\{Roaming,Local}`. The copy matched exactly (1650 files / 912,686,075 B and 9369 files / 2,998,608,897 B). At the end, the real folders were restored from it, and a byte comparison found them identical. See "Restore".

## Summary

| Scenario | Result |
|---|---|
| A. 0.9.0 → 0.9.1 → 1.0.0, real data | **PASS** (every check) |
| B. Silent Porchlight uninstall | **PASS** |
| C. Next to NUber's YTubic 0.5.1 | **PASS** |
| D. Clean machine | **PASS** |
| E. Restore | **PASS**: data byte-identical to the backup, 0.9.0 reinstalled, signed in and running |

No product bugs were found. A few surprises are listed below; none blocks the release.

## A. The real update path

| Check | Result | Evidence |
|---|---|---|
| 0.9.1 `/S /UPDATE` over 0.9.0 | PASS | exit 0. `Uninstall\YTubic` `DisplayVersion` 0.9.1, same `InstallLocation` `"C:\Users\sdand\Desktop\YTubic"`. |
| 0.9.1 writes the stamps on launch | PASS | `plus-marker.json` (Roaming) and `Desktop\YTubic\plus-install.json`, both `{"app":"ytubic-plus","version":"0.9.1"}` at 20:33:24, after the 20:33:07 install. |
| 30 s baseline handoff | PASS | `porchlight-handoff.json` appeared 31 s after launch (576,368 B). |
| Handoff contents | PASS | `format: 1`, `cookieKey: null` (Windows), 14 localStorage keys (the same set CDP read from the live app), IDB `ytubic-rewind` (376 entries) and `ytubic-stores` (2). |
| Tray Quit (0.9.1) exits within ~3 s and refreshes the handoff | PASS | The process was gone **0.13 s** after Quit was chosen. The handoff mtime moved from 20:33:54.68 to 20:36:17.59, 30 ms after the click. |
| 1.0.0 `/S /UPDATE` | PASS | exit 0. A second install, `Uninstall\Porchlight` (Homefronts, 1.0.0, `%LOCALAPPDATA%\Porchlight`, `MainBinaryName porchlight.exe`). As the spike predicted, no `Porchlight.lnk` yet. `ytubic-plus` and `porchlight` point at `porchlight.exe`; `ytubic` is left alone. |
| New Roaming has `accounts.json`, `accounts\`, `bin\`, `downloads\` with matching sizes | PASS | `accounts` 1290 files / 238,097,247 B, the same as old. `bin` 2 / 23,575,754, the same. `downloads` 354 files / 649,203,004 B (old 649,203,003; the +1 B is Porchlight's own `index.json` rewrite). `.window-state.json` and `settings.json` were copied too. |
| Downloads MOVED; old Roaming downloads gone; old Roaming dir kept | PASS | Old Roaming afterwards holds `accounts`, `bin`, `.window-state.json`, `accounts.json`, `plus-marker.json`, `settings.json`, with no `downloads`. Old Local is untouched. |
| `moved-from-plus.json` done + uninstalled | PASS | `{"state":"done","attempts":0,"keyStored":false,"hadDesktop":false,"uninstalled":true,"cleanupAttempts":0,"downloads":"moved","frontendImported":true,...}` (`hadDesktop` is cleared after the Desktop shortcut is made). |
| Live proof of a Plus install (registry key time, version, exe mtime) | PASS | The real 0.9.1 install was proven Plus and removed. `Uninstall\YTubic` was gone about 3 s after Porchlight started. |
| `Uninstall\YTubic` gone, `Desktop\YTubic\ytubic.exe` gone | PASS | Key absent. The folder holds only `plus-install.json` (see Surprises). |
| `Start Menu\Programs\Porchlight.lnk` with AUMID | PASS | Shell COM `ExtendedProperty('System.AppUserModel.ID')` = `io.github.homefronts.porchlight`. `Get-StartApps`: `Porchlight  io.github.homefronts.porchlight`. |
| Desktop shortcut only because `YTubic.lnk` was on the Desktop | PASS | `Desktop\Porchlight.lnk` was created with the same AUMID. `YTubic.lnk` (Start Menu and Desktop) was removed by the old uninstaller. |
| Signed in | PASS | CDP screenshot: "Good evening, Sys0.", account Sys0 with PREMIUM, the user's playlists, Liked Songs 783 tracks. |
| "Moved over from YTubic Plus." toast | PASS | `move_status` = `{"state":"done","notice":"moved"}`. After a page reload in the same process, the DOM had `[data-sonner-toast]` "Moved over from YTubic Plus." (screenshot). By the first check (~25 s), the toast from the first paint had already timed out. |
| Look and settings carried over | PASS | Porchlight has the same 14 localStorage keys as the handoff. 11 values are byte-identical, including `ytm-looks`, `ytm-settings`, `ytm-layout`, `ytm-playback`, `ytm-pinned-playlists` and `musixmatch-user-token`. The other 3 differ only in values the app refreshed at runtime: `ytm-whats-new` 0.9.1 → 1.0.0, and the `lastSeen`/`premiumConfirmedAt` timestamps in `ytm-home-sections`/`ytubic-offline-grant`. IDB `ytubic-rewind` holds 376 entries, matching the handoff. `ytubic-stores` holds `ytm-track-source` and `ytubic-ai-data`. |
| Downloads usable | PASS (listing) | The Downloads page shows "Liked Songs · 172 of 173 songs" and "Copper Changes Color · Caamp · 11 songs". Playback was not started (see Not tested). |
| `ack` happened, handoff deleted | PASS | `frontendImported: true`. The old `porchlight-handoff.json` is gone, and none was written into the new folder. |
| `porchlight://` and `ytubic-plus://` open Porchlight | PASS | `Start-Process porchlight://artist/UCIXtAaNn6M5QQNiiJPjwvng`, then the route became `/artist/UCIXtAaNn6M5QQNiiJPjwvng`. The same check passed for `ytubic-plus://` (after going back to `/`). Same PID throughout (single-instance hand-off). No `ytubic.exe` started. |
| Window title says Porchlight | PASS | OS title "The Capital City - moondoggy · Porchlight". The logo in the app reads PORCH LIGHT. The 1.0.0 What's New is "Porchlight". |
| Tray Quit (1.0.0) exits promptly | PASS | The process was gone 0.13 s after Quit was chosen. |
| Relaunch: no notice, nothing moves again | PASS | No toast in 16 polls over ~11 s. `move_status` `notice: null`. `moved-from-plus.json` content and mtime unchanged. Old downloads still absent. |

## B. Silent uninstall

PASS:
- `%LOCALAPPDATA%\Porchlight\uninstall.exe /S` exited 0. `Uninstall\Porchlight` and the install dir were gone.
- Its uninstaller also removed `Porchlight.lnk` (both) and the `ytubic-plus`/`porchlight` scheme keys, since both pointed at its exe.
- Only `%APPDATA%\io.github.homefronts.porchlight` and `%LOCALAPPDATA%\io.github.homefronts.porchlight` were deleted, after an exact name check. The `…ytubic.fresh-test-2026-10-29` folders were left alone.

## C. Next to NUber's original (YTubic v0.5.1, latest release)

Setup:
- Scenario A had consumed the Plus data, so before C the old Roaming was mirrored back from the backup (downloads included) and the 0.9.1 `plus-marker.json` was put back. That models a Plus user who also has NUber's app.
- `Desktop\YTubic\plus-install.json` (version 0.9.1) had been left by A. It stayed there on purpose: it is the stale-stamp case `proven_plus` must reject.

Steps:
- NUber's `YTubic_0.5.1_Windows_x64_Setup.exe /S` exited 0. Through the leftover `HKCU\Software\github\YTubic` key it installed into the same `Desktop\YTubic` (`Uninstall\YTubic` `DisplayVersion 0.5.1`, `Publisher github`).
- Porchlight 1.0.0 was then installed with `/S` (fresh) and launched.

| Check | Result | Evidence |
|---|---|---|
| NUber's YTubic still installed, key intact, exe present | PASS | `Uninstall\YTubic` 0.5.1 unchanged. `Desktop\YTubic\ytubic.exe` (28,122,112 B, 2026-09-11) present. `ytubic://` still points at it. `YTubic.lnk` kept. |
| Not uninstalled (stale Plus stamp rejected) | PASS | `"uninstalled":false`, `"cleanupAttempts":0`. The stamp said 0.9.1 while the entry said 0.5.1, and the stamp (20:33) was older than the key write (20:39). |
| Downloads copied, not moved | PASS | `"downloads":"copied"`. Old Roaming `downloads` still 354 files / 649,203,003 B; new folder 354 files. |
| Both run at the same time | PASS | `porchlight` (PID 28800, "Porchlight") and `ytubic` (PID 28004, NUber's exe) both had windows at once. Different identifiers, so the single-instance lock didn't block. |
| Porchlight shortcut created | PASS | `Programs\Porchlight.lnk` and `Desktop\Porchlight.lnk` (the Desktop one because NUber's `YTubic.lnk` was on the Desktop) sit next to NUber's `YTubic.lnk` files. |
| Login carried | PASS | `move_status` `done` / `moved`. The look picker's live preview greets "Sys0", the signed-in account. |
| In-app state | expected | No handoff existed in this setup (A had already acked it), so `frontendImported: false` and Porchlight showed the first-run look picker. The "moved" notice waits for the picker, by design (`MoveNotice ready={pickerSeen}`). |

Both apps were quit through their tray menus. Both were then uninstalled with `/S` (exit 0), and only the new Porchlight dirs were deleted.

## D. Clean install

PASS. Steps: renamed both real dirs to `*.e2e-aside`, installed Porchlight with `/S`, launched it. Results:
- `move_status` = `{"state":"notPlus","attempts":0,"notice":null}`. No `moved-from-plus.json`; the new Roaming holds only `bin` and `downloads`. The old dirs were not recreated.
- Signed out ("Sign in" in the sidebar).
- After a reload, the Welcome reads "Welcome to Porchlight. / YouTube Music, made yours. / FORMERLY YTUBIC PLUS · BUILT ON YTUBIC BY NUBER". It auto-advances to "Make it yours." with **Sleeve** preselected. No toast.

Then: tray Quit, `/S` uninstall (exit 0), the new dirs deleted, and the real dirs renamed back.

## Restore

- Mirrored both real dirs from the backup (`robocopy /MIR`, then a second pass with `/IS /IT`, since a few WebView GPU/shader cache `index` files had changed content with the same size and mtime and the first pass skipped them).
- `diff -rq` backup vs real: **rc 0 for Roaming and Local** (byte-identical). `accounts.json` sha256 equal. No `plus-marker.json` or handoff.
- Removed test leftovers: `Desktop\YTubic\plus-install.json` and `HKCU\Software\Homefronts`.
- Reinstalled `YTubic_0.9.0_Windows_x64_Setup.exe /S /D=C:\Users\sdand\Desktop\YTubic`. `Uninstall\YTubic` 0.9.0 points at Desktop\YTubic, and `ytubic-plus`/`ytubic` point at its exe. `YTubic.lnk` is back in the Start Menu and on the Desktop.
- Launched 0.9.0: signed in as Sys0 (Premium), playlists intact. It was relaunched without the debug port and left running. Port 9222 is closed.
- Full dumps: `.superpowers/sdd/2026-10-29-porchlight/e2e-before.txt` and `e2e-after.txt`. The backup is kept at `C:\Users\sdand\YTubicBackup-e2e-2026-10-29`.

## Surprises

1. **`Desktop\YTubic` is left behind holding only `plus-install.json`.** The old uninstaller deletes its own files and runs a non-recursive `RmDir`, so the 0.9.1 stamp keeps the folder alive. It's harmless:
   - the uninstall key is gone, so nothing detects it;
   - if NUber's app later installs there, the stale stamp is rejected (shown in C).

   Still, it's an empty-looking folder on the user's Desktop. A follow-up could have Porchlight delete `plus-install.json` and the empty dir after a successful uninstall.
2. **The old uninstaller removes the `ytubic://` scheme** (it pointed at its own exe). That's intended (Porchlight no longer claims `ytubic://`), but `ytubic://` links stop working for a Plus user until NUber's app is installed.
3. **Copied WebView profiles shrink when first opened.** In C, the new `accounts\…\EBWebView` had 613 fewer files than the old one, because WebView2 dropped 610 HTTP-cache files and compacted IndexedDB leveldb when the profile opened. NUber's app did the same to the old folder. This is not a copy problem; login files and `cookies.enc` were all there and the account was signed in.
4. **`document.title` is still "YTubic Plus"** (`index.html` `<title>`). The OS window title, which users see, is "Porchlight", so this shows only in debug tooling (the CDP target list). Worth a one-line fix in `index.html`.
5. **NUber's installer reuses the Plus install dir.** `HKCU\Software\github\YTubic` survives the old uninstall (silent mode skips the cleanup), so NUber's `/S` install lands in `Desktop\YTubic`, the folder Plus used. That's why the stale-stamp guard matters, and it held.
6. Porchlight's own silent uninstall leaves `HKCU\Software\Homefronts\Porchlight` behind (also seen in the spike).
7. Owner-drawn tray menu items are invisible to UI Automation. The test opened the real tray menu by posting the shell's tray callback (`WM_USER_TRAYICON`, `WM_RBUTTONDOWN`) to the app's `tray_icon_app` window, then sent Up and Enter to the popup. That is the same code path as a mouse right-click on the icon. No mouse or global keyboard input was used.

## Not tested

- **macOS and Linux:** nothing run. The macOS 0.9.0 → 0.9.1 → 1.0.0 path (WKWebView storage via the handoff, keychain key carry, bundle rename) remains a known risk until it is run on a Mac.
- **"Try again" / failed-move path:** not triggered. A safe trigger would need a failing copy or uninstall on real data. It is covered only by the unit tests.
- **The updater itself** (download, signature check, feed URL switch): the installers were run directly with `/S /UPDATE`, because there is no signing key locally.
- **Offline playback** of a moved download, media keys and the SMTC tile: not exercised, to avoid playing audio on the user's PC during the run. The AUMID on the shortcut and in `Get-StartApps` is correct, and the spike showed the SMTC session uses it.
- **A user with a custom look:** the user's look was the default Sleeve. `ytm-looks` was carried over byte-identical, so a custom value travels the same way.
