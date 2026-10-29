# Porchlight install spike (Windows)

Date: 2026-10-29. Machine: the user's Windows 11 Pro 10.0.26200 PC, with YTubic 0.9.0 installed per-user.
Scratch build: a throwaway worktree of `136f028` with `productName: "Porchlight"`, `identifier: "io.github.homefronts.porchlight"`, `bundle.publisher: "Homefronts"`, built with `pnpm tauri build` (tauri-cli 2.10.1, `createUpdaterArtifacts: false`). A second scratch build also changed `src-tauri/src/appid.rs` so the release AUMID is `io.github.homefronts.porchlight` (see finding 3). Nothing from the worktree was committed.

The generated NSIS script for this build (`target/release/nsis/x64/installer.nsi`) is quoted below by line number.

## Summary

| Fact | Result |
|---|---|
| (a) The Porchlight build installed over 0.9.0 with `/S /UPDATE` makes a second install | **CONFIRMED** |
| (b) The old uninstaller with `/S` removes the exe, shortcuts and key, keeps app data and the re-registered URL schemes | **CONFIRMED**, with one surprise: it also kills a running Porchlight (same `ytubic.exe` name) |
| (c) The old install dir comes from `Uninstall\YTubic` → `InstallLocation` (fallback `UninstallString`) | **CONFIRMED** (the value is quoted and is a custom dir on this PC) |
| (d) After the old uninstall, the Porchlight shortcut's AUMID still drives the media tile | **CONFIRMED only if a Porchlight shortcut exists and `appid.rs` is changed.** A `/UPDATE` install creates **no** shortcuts (see finding 1) |

## (a) Second install: CONFIRMED

Command: `Porchlight_0.9.0_x64-setup.exe /S /UPDATE` (exit 0). That matches `bundle.windows.installMode: "quiet"` in our config, plus the `/UPDATE` the updater appends.

Both keys were present afterwards:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTubic        (unchanged)
    DisplayName  YTubic   Publisher github
    InstallLocation  "C:\Users\sdand\Desktop\YTubic"
    UninstallString  "C:\Users\sdand\Desktop\YTubic\uninstall.exe"
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Porchlight    (new)
    MainBinaryName ytubic.exe  DisplayName Porchlight  Publisher Homefronts  DisplayVersion 0.9.0
    InstallLocation  "C:\Users\sdand\AppData\Local\Porchlight"
    UninstallString  "C:\Users\sdand\AppData\Local\Porchlight\uninstall.exe"
HKCU\Software\Homefronts\Porchlight  (Default) = C:\Users\sdand\AppData\Local\Porchlight   (new)
HKCU\Software\github\YTubic          (Default) = C:\Users\sdand\Desktop\YTubic             (unchanged)
```

Folders: `C:\Users\sdand\Desktop\YTubic\{ytubic.exe, uninstall.exe}` stayed. `%LOCALAPPDATA%\Porchlight\{ytubic.exe, uninstall.exe}` was new.
URL schemes: the Porchlight install rewrote both `HKCU\Software\Classes\ytubic-plus` and `...\ytubic` to `URL:io.github.homefronts.porchlight protocol`, with the command `"C:\Users\sdand\AppData\Local\Porchlight\ytubic.exe" "%1"` (last writer wins).

## (b) Old uninstaller `/S`: CONFIRMED (plus one surprise)

Command (path built from `InstallLocation`): `"C:\Users\sdand\Desktop\YTubic\uninstall.exe" /S`. It returned 0 after about 1.3 s, and the key was already gone when it returned. NSIS copies the uninstaller to %TEMP% and relaunches it, so a hook should still poll for the key to disappear rather than trust the wait.

Afterwards:
- `Uninstall\YTubic`: **gone**. `C:\Users\sdand\Desktop\YTubic`: **gone** (exe, uninstaller, folder).
- `Start Menu\Programs\YTubic.lnk` and `Desktop\YTubic.lnk`: **gone**. The Porchlight `.lnk` files were untouched.
- `%APPDATA%\com.github.ivasy.ytubic` and `%LOCALAPPDATA%\com.github.ivasy.ytubic` (test data: `bin`, `downloads`, `covers`, `EBWebView`, `stream`, `stream-ephemeral`, plus a `SPIKE-MARKER.txt` in each): **kept, all contents intact**. Silent mode leaves `$DeleteAppDataCheckboxState` unset, so the `RmDir /r` (installer.nsi l.815-828) does not run.
- `ytubic-plus` / `ytubic` URL keys: **kept, still pointing at Porchlight**. The uninstaller only deletes a scheme whose command equals its own exe (l.752-759).
- `HKCU\Software\github\YTubic`: **kept**. The `MANUPRODUCTKEY` cleanup only runs together with app-data deletion (l.817-824). It is harmless, but it is what makes a later 0.9.0 reinstall go back to the old dir.

**Surprise: the old uninstaller killed the running Porchlight.** The Porchlight exe is still `ytubic.exe`, because the Cargo package name was not changed. `CheckIfAppIsRunning "ytubic.exe"` (utils.nsh l.22-70) finds it via `FindProcessCurrentUser` by name, and in silent mode it jumps straight to `KillProcessCurrentUser`. Porchlight (started from `%LOCALAPPDATA%\Porchlight\ytubic.exe`) was running before the uninstall and was gone afterwards. Under the updater flow nothing is running at that point, so a PREINSTALL/POSTINSTALL hook is safe. Anything that runs the old uninstaller *from inside a running Porchlight* (for example a first-launch cleanup) would kill itself. Renaming the main binary (`porchlight.exe`) avoids this.

## (c) Install dir lookup: CONFIRMED

`InstallLocation` exists and is written **with quotes** (`"C:\Users\sdand\Desktop\YTubic"`, installer.nsi l.662), so strip the `"` before joining the path. `UninstallString` is also quoted (`"C:\...\uninstall.exe"`, l.663). On this PC the dir is a **custom location** (`C:\Users\sdand\Desktop\YTubic`), not the default `%LOCALAPPDATA%\YTubic`. So never hard-code the default.

Also, `%LOCALAPPDATA%\YTubic\uninstall.exe` (dated 2026-10-13) is a stray leftover from an older install there. It has no key of its own, and the spike left it alone. Some users may have similar orphans.

What worked (PowerShell, as used in the spike):
```powershell
$k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTubic'
$loc = (Get-ItemProperty $k).InstallLocation.Trim('"')
& (Join-Path $loc 'uninstall.exe') /S
```
In NSIS terms: `ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YTubic" "InstallLocation"`, strip the quotes, then `ExecWait '"$0\uninstall.exe" /S'`. If `InstallLocation` is empty, use the `UninstallString` value as the command (it is already quoted) plus ` /S`.

## (d) AUMID and media tile: CONFIRMED, with two conditions

**Finding 1: a `/UPDATE` install creates no shortcuts for a new product.** `CreateOrUpdateStartMenuShortcut` and `CreateOrUpdateDesktopShortcut` return early when `$UpdateMode = 1` (installer.nsi l.882-889, l.911-918). They only retarget a shortcut that already has the *same product name*. After `/S /UPDATE` there was no `Porchlight.lnk` anywhere. The old uninstaller then deletes `YTubic.lnk`. **The updater path therefore leaves the user with no Start Menu or desktop shortcut at all**, and so with nothing to resolve the tile's AUMID. Task 4's hook (or a POSTINSTALL step) must create `$SMPROGRAMS\Porchlight.lnk` (and the desktop one, if `YTubic.lnk` existed there) and stamp the AUMID on them, for example by reusing the `SetLnkAppUserModelId` macro from utils.nsh.

**Finding 2: `appid.rs` hard-codes the AUMID.** `src-tauri/src/appid.rs` pins `const AUMID = "com.github.ivasy.ytubic"` (release) or `"...ytubic.dev"` (debug) on the process. A conf-only rename would keep reporting the old AUMID. Once `YTubic.lnk` is gone, that AUMID matches no shortcut, and the tile would read "Unknown app" (inferred from the module's own docs; not run). Task 2 must change it to `io.github.homefronts.porchlight` (and pick a dev id).

With both handled, here is what the test showed. It used the AUMID-patched build, installed with plain `/S` so the shortcuts exist, after the old `/S` uninstall:
```
Porchlight.lnk (Start Menu and Desktop) -> C:\Users\sdand\AppData\Local\Porchlight\ytubic.exe | AUMID=io.github.homefronts.porchlight
Get-StartApps: Porchlight => io.github.homefronts.porchlight
SMTC sessions (GlobalSystemMediaTransportControlsSessionManager), after launching via shell:AppsFolder\io.github.homefronts.porchlight:
  session AUMID=io.github.homefronts.porchlight | status=Stopped
```
The media session carries the new AUMID, and Windows maps it to "Porchlight" through the Start Menu shortcut. Nothing was played (the fresh test profile was signed out), so the flyout tile itself was not looked at.

## Other notes

- The main binary stays `ytubic.exe` unless the Cargo package or `mainBinaryName` changes. It shows up in `MainBinaryName`, the URL commands and the process-kill check above.
- Porchlight's own uninstall (`/S`) left `HKCU\Software\Homefronts\Porchlight` behind, for the same reason as the `github\YTubic` key. The spike deleted it by hand.
- The 0.9.0 release setup (`YTubic_0.9.0_Windows_x64_Setup.exe`) is not Authenticode-signed (`NotSigned`). With `/S` and the leftover `HKCU\Software\github\YTubic` key, it reinstalled into `C:\Users\sdand\Desktop\YTubic`.

## Restore

The user's data was renamed aside (`*.backup-porchlight-spike`) before the test and renamed back after it. The test installs and test data folders were removed, and 0.9.0 was reinstalled with `/S`. The before/after registry, folder and shortcut dumps match except for the new uninstaller timestamp and the PID. `accounts.json` is present, and the app is running from `C:\Users\sdand\Desktop\YTubic\ytubic.exe`.
