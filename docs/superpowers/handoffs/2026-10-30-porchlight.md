# Handoff: Porchlight 1.0.0 (2026-10-30)

Read this first, then the ledger at `.superpowers/sdd/2026-10-29-porchlight/progress.md` (local, git-ignored).

## Where things stand

- **Code-complete** on branch `porchlight` (head `4014fc8`, plus this doc). Not pushed, not merged.
  - All 7 build tasks are done and reviewed.
  - The final whole-branch review on Opus came back as "with fixes", the fixes landed, and the re-review was clean.
- **What remains: Task 8, the release runbook** in `docs/superpowers/plans/2026-10-29-porchlight.md`. Every step needs the user's go-ahead.
- **0.9.1 bridge:** released by tagging commit **`42406eb`**, which carries the old identity. It isn't a branch head, so tag that exact commit.
- **1.0.0:** released from the `porchlight` branch after it's merged to main.

## Release runbook (summary; the plan has the full text)

1. Rename the repo `Homefronts/YTubic-Plus` → `Homefronts/Porchlight`. Leave NUber's fork network (repo Settings, or GitHub Support).
2. Release 0.9.1 from Porchlight (tag `v0.9.1` on 42406eb). Publish only if all four builds succeeded and latest.json lists darwin, linux, windows-x86_64 and windows-aarch64.
3. Immediately create the stub `Homefronts/YTubic-Plus` repo:
   - the v0.9.1 release copied as Latest, with all assets and latest.json
   - `docs/s/` from 42406eb, with Pages on
   - the `ai-data` branch
   - `src-tauri/icons/icon.png` on main
   - a README pointing to Porchlight
   Also create a **second stub, `Homefronts/YTubic-`**, with the same v0.9.1 release as Latest. Plus 0.6.0 to 0.7.1 check `Homefronts/YTubic-/…/latest.json`, from the repo's old name, and would otherwise be redirected to Porchlight and skip the bridge.
4. **Hard gate:** for both `YTubic-Plus` and `YTubic-`, `curl -sI …/releases/latest/download/latest.json` must not redirect to Porchlight, and each body must say 0.9.1.
5. Let 0.9.1 spread. The user decides how long.
6. Merge `porchlight` to main, then release v1.0.0 from Porchlight. Check the new feed says 1.0.0.

Tag pushes start the release build. Pass `-R` on every `gh release` command. Publishing (`--draft=false --latest`) is blocked by the auto-mode safety check, so the user runs that command themselves.

## Proven on the user's Windows PC (docs/superpowers/research/2026-10-29-porchlight-e2e.md)

- **Real data, 0.9.0 → 0.9.1 → 1.0.0:**
  - signed in, look and settings carried over, downloads moved
  - the old Plus uninstalled, an AUMID Start Menu shortcut created
  - the "Moved over" notice shown, links working, tray Quit at 0.13 s
- **Side by side with NUber's YTubic 0.5.1:**
  - NUber's app untouched (a stale stamp was rejected)
  - downloads copied, not moved
  - both apps ran at once
- **Clean install:** a normal fresh start.

## Not tested (known risks)

- **macOS end to end:** the in-place update across the binary rename, WKWebView storage, the bundle rename.
- **Linux.** On Linux package installs, the old Plus package stays installed by design, because the package relations could also remove NUber's package. This is listed as a known issue in What's New.
- **The real updater signature check, "Try again", and offline playback after the move.**
- **The Windows uninstaller timeout path, and carrying over "launch at login" against the real registry.**

## User's machine

- 0.9.0 is installed at `C:\Users\sdand\Desktop\YTubic`, running and signed in.
- Full data backup at `C:\Users\sdand\YTubicBackup-e2e-2026-10-29`. Keep it until the user says to delete it.
- Leftover test folders `…ytubic.fresh-test-2026-10-29` in Roaming and Local can go when the user OKs it.
