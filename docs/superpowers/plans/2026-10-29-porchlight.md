# Porchlight 1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename YTubic Plus to Porchlight with its own app ID, and move every Plus user over by auto-update with their data, no second copy and nothing to click.

**Architecture:**
- **0.9.1 bridge (old ID).** It stamps the data folder and the install as Plus, and keeps a handoff file of the WebView's persistent state (plus the keychain login key on macOS/Linux). It also points its updater at the Porchlight feed.
- **1.0.0 Porchlight (new ID and name).** On first launch, and only when both Plus stamps exist, it copies the data, imports the handoff, verifies the result, then removes the old Plus install.
- **GitHub.** The main repo is renamed to Porchlight. A small replacement `Homefronts/YTubic-Plus` repo then keeps serving 0.9.1 as its latest release (the bridge for anyone still on 0.9.0 or older) and hosts the share page.

**Tech Stack:** Tauri 2 (Rust), React 19 + TypeScript, zustand persist, idb-keyval stores, NSIS (Windows), GitHub Actions + tauri-action, vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-10-29-porchlight-design.md`
**Research:** `.superpowers/research/tauri-identifier-change.md` (local)

## Global Constraints

- **New identifier:** `io.github.homefronts.porchlight`. Old identifier: `com.github.ivasy.ytubic`.
- **productName:** `Porchlight`. **publisher:** `Homefronts`. **Version:** bridge `0.9.1`, then `1.0.0`.
- **Deep-link schemes in 1.0.0:** `["porchlight", "ytubic-plus"]`. `ytubic` is no longer claimed.
- **Updater feeds:**
  - 0.9.1 and 1.0.0 both read `https://github.com/Homefronts/Porchlight/releases/latest/download/latest.json`.
  - The old URL `https://github.com/Homefronts/YTubic-Plus/releases/latest/download/latest.json` must return 0.9.1 for good.
- **File names in the OLD app data dir:** marker `plus-marker.json`, handoff `porchlight-handoff.json`. Install stamp `plus-install.json`, next to the old executable on Windows/Linux or in `Contents/Resources` on macOS.
- **File in the NEW app data dir:** `moved-from-plus.json`, holding `{ "state": "done" | "pending", "attempts": number, "at": string }`.
- **Never touch the old install or old data unless `plus-marker.json` exists.** Never remove the old install unless `plus-install.json` also exists. Old data folders are never deleted (NUber's app may use them).
- **The handoff file** is owner-only readable. It is deleted after a verified import.
- **UI copy** has no em or en dashes (house rule). Notice copy:
  - after a successful move: "Moved over from YTubic Plus."
  - after the 3rd failed attempt: "Couldn't finish moving your YTubic Plus data. Your old app is still installed." with a "Try again" button.
- **Credit** stays: README and About keep "Built on YTubic by NUber". The Welcome origin line becomes "FORMERLY YTUBIC PLUS · BUILT ON YTUBIC BY NUBER".
- **Releases:** never push a tag or publish without the user's explicit go-ahead. Tag pushes start the release build. Pass `-R` on every `gh release` command.
- **Testing on the user's machine:** back up both app data folders before any run that changes them, and restore after. Use the 2026-10-29 rename-aside pattern: rename the folders to a backup name, never delete.

## Review Focus

1. **Plus and NUber's YTubic both installed, sharing the "YTubic" install slot.** Porchlight must never uninstall NUber's app.
   - Test: marker present, install stamp missing → data copied, no removal (Task 4).
2. **A user who never signed in, or whose session expired, or who is offline on first launch.** The move must still verify and finish.
   - Test: verify passes with no `accounts.json` and with zero accounts (Task 4).
3. **A first launch that is killed mid-copy.** The next launch must resume or redo cleanly, with no half state treated as done.
   - Test: `state: "pending"` re-runs the whole copy idempotently (Task 4).
4. **A downloads folder of several GB on a nearly full disk.** The copy fails cleanly and the old install stays.
   - Test: copy error → attempts+1, no removal, old files untouched (Task 4).
5. **A handoff that is missing, corrupt or from a newer format.** Porchlight still starts, carries over what it can, and never crashes.
   - Test: corrupt JSON → files still copied, frontend state left default, not marked done until retry succeeds or attempts hit 3 (Task 4 + Task 5).

---

### Task 1: Prove the installer and updater behaviour on Windows (spike, no product code)

**Files:**
- Create: `docs/superpowers/research/2026-10-29-porchlight-install-spike.md` (committed findings)
- Throwaway: a scratch copy of the repo, in a git worktree or under the scratchpad. Nothing from it is committed.

**Interfaces:** Produces the facts Tasks 2, 4 and 7 rely on. Record each one as CONFIRMED or DIFFERENT, with evidence:
- (a) Installing a `productName: "Porchlight"`, `identifier: io.github.homefronts.porchlight`, `publisher: "Homefronts"` build over an installed YTubic 0.9.0 gives a second install: a new `Uninstall\Porchlight` key, while the old `YTubic` entry stays.
- (b) The old uninstaller runs silently with `"<old install dir>\uninstall.exe" /S`:
  - it removes the exe, shortcuts and uninstall key
  - it does NOT delete `%APPDATA%\com.github.ivasy.ytubic` or `%LOCALAPPDATA%\com.github.ivasy.ytubic`
  - it does not touch the `ytubic-plus` URL registration once Porchlight re-registers it
- (c) The old install dir is read from `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTubic` → `InstallLocation`. If that value is missing, use `UninstallString`.
- (d) After the `/S` uninstall of the old app, the Porchlight Start Menu shortcut's AUMID (`io.github.homefronts.porchlight`) still drives the media tile.

- [ ] **Step 1:** Install the released 0.9.0 setup in a Windows user profile. Back up the user's real data first; the dev machine is the user's own PC.
- [ ] **Step 2:** Build a scratch NSIS installer with the three config changes above (`pnpm tauri build`, scratch copy only). Run it with `/S /UPDATE`, the way the updater's quiet mode does, and record (a).
- [ ] **Step 3:** Run the old uninstaller with `/S` and record (b), (c) and (d).
- [ ] **Step 4:** Write the findings doc. For any DIFFERENT result, stop and report BLOCKED with the evidence. The controller adjusts Tasks 4 and 7 before they start.
- [ ] **Step 5:** Restore the user's data and remove the test installs. Commit only the findings doc: `docs(research): Porchlight install spike`.

### Task 2: 0.9.1 bridge: Plus stamps and handoff export

**Files:**
- Create: `src-tauri/src/bridge.rs`, `src/lib/bridge/handoff.ts`, `src/lib/bridge/handoff.test.ts`
- Modify:
  - `src-tauri/src/lib.rs`: register commands, call `bridge::stamp` at startup, write the handoff in the existing flush-before-quit and flush-before-update paths
  - the frontend quit/update flush call sites added in 96bc42b (find them with `grep -rn "flush" src/lib/store/playback.ts src/lib/updater.ts`)
  - `src-tauri/tauri.conf.json`: version `0.9.1`; updater endpoint → the Porchlight feed URL
  - `package.json`, `src-tauri/Cargo.toml`, `Cargo.lock` (app crate only), `bug_report.yml`: version `0.9.1`
  - `src/lib/whats-new.ts`: a short 0.9.1 entry, "Getting ready for Porchlight." No dashes.

**Interfaces:**
- Produces (Rust, in `bridge.rs`):
  - `pub fn stamp(app: &AppHandle) -> Result<(), String>`. Writes `plus-marker.json` `{ "app": "ytubic-plus", "version": "<pkg version>" }` to `app_data_dir`. Writes `plus-install.json` with the same content beside `std::env::current_exe()`'s directory (Windows/Linux) or into `<bundle>/Contents/Resources` (macOS). Failure to write the install stamp is logged, not fatal.
  - `#[tauri::command] write_handoff(app, json: String) -> Result<(), String>`. Wraps the frontend JSON as `{ "format": 1, "frontend": <json>, "cookieKey": <base64 | null> }` and writes `porchlight-handoff.json` to `app_data_dir`, owner-only (unix mode 0600; Windows inherits the per-user AppData ACL). `cookieKey` is read via the existing `secure_store` keyring path on macOS/Linux and is null on Windows.
- Produces (TS, in `handoff.ts`):
  - `export async function collectHandoff(): Promise<HandoffFrontend>`
  - `export type HandoffFrontend = { localStorage: Record<string, string>; idb: Record<string, unknown> }`
  - `localStorage` holds every key except the cache keys `ytubic-query-cache` and `ytubic-cover-cache`.
  - `idb` holds every entry of the `ytubic-stores`/`kv` store (via the existing `createStore("ytubic-stores","kv")` handle in `src/lib/store/idb-storage.ts`). The `ytubic-cache` store is excluded.

- [ ] **Step 1: Failing tests.**
  - `handoff.test.ts` (jsdom, `vi.hoisted` localStorage stub like `src/lib/ai/use-ai-hooks.test.ts`, idb-keyval mocked): `collectHandoff()` includes `ytm-settings` and `ytm-looks`, excludes `ytubic-query-cache`, and returns the `idb` entries given to the mocked store.
  - Rust `bridge.rs` tests (tempdir):
    - `stamp` writes both files with `"app":"ytubic-plus"`
    - `write_handoff` output parses and has `format: 1`
    - on unix, the file mode is `0o600`
- [ ] **Step 2:** Run `node_modules/.bin/vitest run src/lib/bridge` and `cargo test -p ytubic bridge`. Expect FAIL.
- [ ] **Step 3:** Implement. Call `collectHandoff()` + `invoke("write_handoff")` from the existing quit flush and from the updater right before `downloadAndInstall`. Don't block quit for more than 2 s.
- [ ] **Step 4:** Run both test commands, then the full `vitest run`, `tsc --noEmit` and `cargo check`. Expect PASS.
- [ ] **Step 5:** Commit `feat(bridge): mark Plus installs and hand off data for Porchlight (0.9.1)`.

### Task 3: Identity: name, app ID, links, keychain service

**Files:**
- Modify:
  - `src-tauri/tauri.conf.json`: `productName`, `identifier`, `publisher`, schemes; the endpoint is already set by Task 2
  - `src-tauri/src/appid.rs`: AUMID `io.github.homefronts.porchlight`, plus `.dev` for debug
  - `src-tauri/src/lib.rs`:
    - `KEYRING_SERVICE` → `io.github.homefronts.porchlight`
    - window and tray titles: "Porchlight", "Porchlight · Player", "Show Porchlight", "Porchlight (dev)", "Porchlight session keeper"
    - boot log
    - `is_background_link` accepts `porchlight:` and `ytubic-plus:` only
  - `src-tauri/src/discord.rs` and `src-tauri/src/media.rs`: display "Porchlight", dbus name `porchlight`
  - `src-tauri/Cargo.toml`: package and lib names `porchlight`; update every `ytubic::`/`ytubic_lib` reference the compiler flags
  - temp-dir prefixes `ytubic-*` → `porchlight-*`
  - `src/lib/app-name.ts`: `APP_NAME = "Porchlight"`
  - `src/lib/deep-link.ts`: parse `porchlight:` and `ytubic-plus:`; `universalShareUrl` builds `porchlight://` links
  - the Welcome origin line: show the FORMERLY part when `APP_NAME !== "YTubic Plus"`
  - logo text in `app-sidebar.tsx`: two-line "PORCH / LIGHT."
  - tests that assert the old names
- `tauri.linux.conf.json`: deb/rpm `replaces` and `conflicts` = `["ytubic"]`. Check the Tauri 2 schema key names.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the new identity that Task 4's path logic depends on.
  - `OLD_IDENTIFIER = "com.github.ivasy.ytubic"`, exported from `src-tauri/src/migrate.rs` in Task 4 (don't define it here).
  - `OLD_KEYRING_SERVICE` is the same string.

- [ ] **Step 1: Failing tests.** Update the existing tests to the new behaviour:
  - `deep-link.test.ts`: `parseDeepLink("porchlight://watch?v=dQw4w9WgXcQ")` and the `ytubic-plus://` form parse; `ytubic://watch?v=…` returns `null`; `universalShareUrl` output contains `porchlight://`
  - Rust `is_background_link("porchlight://watch?v=abcdefg&background=1")` is true; the `ytubic:` form is false
- [ ] **Step 2:** Run `node_modules/.bin/vitest run src/lib/deep-link.test.ts` and `cargo test -p porchlight is_background`. Expect FAIL.
- [ ] **Step 3:** Make the edits above. Grep afterwards: `grep -rn "YTubic\b\|ytubic:" src src-tauri/src` shows only credit lines, the migration constants and `ytubic-plus`.
- [ ] **Step 4:** Run the full `vitest run`, `tsc --noEmit` and `cargo test`. Expect PASS.
- [ ] **Step 5:** Commit `feat: Porchlight name and app ID`.

### Task 4: First-launch move from Plus (Rust)

**Files:**
- Create: `src-tauri/src/migrate.rs` (with `#[cfg(test)]` tests)
- Modify: `src-tauri/src/lib.rs`. Call `migrate::run` in `setup` before the main window loads its page, and register the commands below.

**Interfaces:**
- Consumes: the Task 1 findings (the uninstall command, where the install dir comes from) and the Task 2 file formats.
- Produces:
  - `pub const OLD_IDENTIFIER: &str = "com.github.ivasy.ytubic";`
  - `pub struct MoveOutcome { pub state: MoveState, pub attempts: u32, pub notice: Option<Notice> }`
  - `pub enum MoveState { NotPlus, Done, Pending }`
  - `pub enum Notice { Moved, Failed }`
  - `pub fn run(paths: &MovePaths, uninstall: &dyn Fn(&Path) -> Result<(), String>) -> MoveOutcome`. A pure core that takes injected paths and the uninstall action so tests use tempdirs.
  - `MovePaths { old_roaming, old_local, new_roaming, new_local, old_install_stamp: Option<PathBuf>, old_install_dir: Option<PathBuf> }`, plus `fn MovePaths::detect(app) -> MovePaths`, which uses Task 1's registry lookup on Windows.
  - `#[tauri::command] take_handoff_frontend() -> Option<serde_json::Value>`. Returns the handoff's `frontend` object once.
  - `#[tauri::command] move_status() -> MoveOutcome`, serialized for the frontend notice.
  - `#[tauri::command] retry_move()`.

**Behaviour:**
- **No `plus-marker.json` in `old_roaming`** → `NotPlus`. Nothing is read or written.
- **Already `done` in `new_roaming/moved-from-plus.json`** → `Done`, no work, no notice.
- **Otherwise:**
  - write `pending`
  - copy `old_roaming` files except the handoff and marker; copy `old_local` minus `EBWebView` and caches
  - for `downloads/`: rename across when on the same volume and no NUber install is detected (no `old_install_stamp` but an old install dir exists = NUber present), else copy
  - store `cookieKey` under the new `KEYRING_SERVICE` (macOS/Linux)
  - **verify:** every copied file exists with the same size, and the handoff parsed (or was absent)
  - **on success:** write `done`; if `old_install_stamp` exists, call `uninstall(old_install_dir)`; delete the handoff; `notice = Moved`
  - **on any error:** `attempts += 1`, state stays `pending`, no uninstall; `notice = Failed` once `attempts >= 3`
  - **macOS only, after `done`:** if the running bundle's folder isn't named `Porchlight.app` and its parent is writable without a password prompt, rename it to `Porchlight.app` and relaunch from there; otherwise leave it, with no prompt. Test `mac_rename_skipped_when_parent_not_writable`, written against a plain helper that takes the bundle path and a writable flag.

- [ ] **Step 1: Failing tests** (tempdir trees):
  - `not_plus_without_marker`: no files created anywhere
  - `copies_and_uninstalls_with_both_stamps`: uninstall closure called once with the install dir; `done` written
  - `copies_but_never_uninstalls_without_install_stamp`: closure never called
  - `verifies_without_accounts`: no `accounts.json` → still `done` (Review Focus 2)
  - `pending_reruns_idempotently` (Review Focus 3)
  - `copy_error_keeps_old_install`: unwritable destination → attempts 1, closure never called, old files intact (Review Focus 4)
  - `corrupt_handoff_does_not_block_files`: files copied, state `pending`, then `done` on the retry once the handoff is absent (Review Focus 5)
  - `failed_notice_after_three_attempts`
- [ ] **Step 2:** Run `cargo test -p porchlight migrate`. Expect FAIL.
- [ ] **Step 3:** Implement `run`, `MovePaths::detect` and the commands. The real `uninstall` is: Windows, the Task 1 command; macOS, remove the old bundle path if it differs from the running one; Linux AppImage, remove the old file; deb/rpm need nothing, since Task 3's replaces handles them.
- [ ] **Step 4:** Run `cargo test -p porchlight` and `cargo check`. Expect PASS.
- [ ] **Step 5:** Commit `feat: move data over from YTubic Plus on first launch`.

### Task 5: Frontend import and move notices

**Files:**
- Create: `src/lib/bridge/import.ts`, `src/lib/bridge/import.test.ts`
- Modify:
  - `src/main.tsx`: before any store module loads, `await importHandoff()`, then dynamically `import("./App")`. Keep the existing order of theme/apply imports after it.
  - a small `src/components/layout/move-notice.tsx` mounted in `app-shell.tsx`

**Interfaces:**
- Consumes: `take_handoff_frontend`, `move_status`, `retry_move` (Task 4); `HandoffFrontend` (Task 2).
- Produces:
  - `export async function importHandoff(): Promise<"imported" | "none" | "invalid">`
  - It writes each `localStorage` entry only where the key is absent, so it never overwrites Porchlight data, and writes every `idb` entry into `ytubic-stores`/`kv`.
  - `invalid` covers a wrong shape or a `format` other than 1. Nothing is written in that case.

- [ ] **Step 1: Failing tests** (jsdom, stubbed invoke and idb):
  - `imports_missing_keys_only`
  - `invalid_format_writes_nothing`
  - `none_when_no_handoff`
  - the notice renders "Moved over from YTubic Plus." for `Moved` and the failure copy with a "Try again" button for `Failed`; clicking calls `retry_move`
- [ ] **Step 2:** Run `node_modules/.bin/vitest run src/lib/bridge`. Expect FAIL.
- [ ] **Step 3:** Implement. Show the notice once (it goes away when dismissed), not in the floating window, and after the Welcome/picker if those are showing.
- [ ] **Step 4:** Run the full `vitest run` and `tsc --noEmit`. Expect PASS.
- [ ] **Step 5:** Commit `feat: bring Plus data into Porchlight and say so`.

### Task 6: Words, docs and share page

**Files:**
- Modify:
  - `README.md`: name, intro, install links → `Homefronts/Porchlight`. Keep the NUber credit block. Add a short "Formerly YTubic Plus" note.
  - `src/lib/whats-new.ts`: 1.0.0 entry: "YTubic Plus is now Porchlight", plus "your library, settings and looks came with you"
  - `.github/ISSUE_TEMPLATE/*`: names and version placeholder `1.0.0`
  - `docs/s/index.html`: open `porchlight://`, fall back to the YouTube Music link; title "Porchlight"
  - About dialog name
  - `package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock` (app crate): version `1.0.0`
  - `.github/workflows/release.yml`: any hard-coded repo name
- [ ] **Step 1:** Make the edits. `grep -rn "YTubic Plus" README.md src docs/s .github` shows only credit and "formerly" lines.
- [ ] **Step 2:** Run the full `vitest run`, `tsc --noEmit` and `cargo check`. Expect PASS.
- [ ] **Step 3:** Commit `docs: Porchlight 1.0.0`.

### Task 7: End-to-end test on Windows (user's machine, guarded)

**Files:** Create `docs/superpowers/research/2026-10-29-porchlight-e2e.md` (results).

- [ ] **Step 1:** Back up both real app data folders (rename aside, as in Global Constraints).
- [ ] **Step 2:** Build local installers for 0.9.1 (from the Task 2 commit) and 1.0.0 (HEAD). Install 0.9.0 from the release, sign in, set a custom look, download 1 song.
- [ ] **Step 3:** Install 0.9.1 with `/S /UPDATE`, launch it, quit. Confirm both stamps and `porchlight-handoff.json` exist.
- [ ] **Step 4:** Install 1.0.0 with `/S /UPDATE`, launch it. Expect all of the following:
  - signed in
  - the custom look active
  - the downloaded song plays offline
  - the "Moved over from YTubic Plus." notice
  - `Uninstall\YTubic` gone, old folders still present, handoff deleted
  - `ytubic-plus://` and `porchlight://` links open Porchlight
  - media keys and the taskbar tile say Porchlight
- [ ] **Step 5:** Fresh scenario with NUber's YTubic installed (its latest release) and then Porchlight installed: NUber's app untouched and both run at once.
- [ ] **Step 6:** Fresh scenario with nothing installed: Porchlight starts clean with Sleeve and the picker.
- [ ] **Step 7:** Restore the user's real data. Write the results doc and commit `docs(research): Porchlight end-to-end results`.
- [ ] **Step 8:** macOS. Record "not tested here" unless the user can run the same 0.9.0 → 0.9.1 → 1.0.0 path on a Mac. Report it as a known risk either way.

### Task 8: Release runbook (each step needs the user's go-ahead)

**Files:** none (operations). Record what was done in the handoff doc.

- [ ] **Step 1:** Rename the repo `Homefronts/YTubic-Plus` → `Homefronts/Porchlight` and leave NUber's fork network (repo Settings, or GitHub Support if that option isn't offered). Run `git remote set-url origin` locally.
- [ ] **Step 2:** Release 0.9.1 from `Homefronts/Porchlight` (tag `v0.9.1` on commit `42406eb`, draft). Publish it only if all four builds succeeded and its `latest.json` lists the `darwin`, `linux`, `windows-x86_64` and `windows-aarch64` platforms.
- [ ] **Step 3:** Immediately create the stub repo `Homefronts/YTubic-Plus`:
  - copy the `v0.9.1` release and all its assets, including `latest.json`, as Latest (`gh release download` + `gh release create --latest`)
  - push `docs/s/` taken from `42406eb` (it uses `ytubic-plus://`) with GitHub Pages enabled, so old share links keep working
  - push the `ai-data` branch (0.9.x reads `raw.githubusercontent.com/Homefronts/YTubic-Plus/ai-data/ai-artists.json`)
  - push `src-tauri/icons/icon.png` on `main` (Discord `LOGO_URL`)
  - add a README pointing to Porchlight
- [ ] **Step 4:** **Hard gate before 1.0.0:** `curl -sI https://github.com/Homefronts/YTubic-Plus/releases/latest/download/latest.json` must not redirect to Porchlight, and the file's body must say `"version": "0.9.1"`. Stop here if either check fails.
- [ ] **Step 5:** Let 0.9.1 spread. The user decides how long.
- [ ] **Step 6:** Release v1.0.0 from `Homefronts/Porchlight` (tag `v1.0.0`, draft, then publish as Latest). Check that the new feed URL returns `"version": "1.0.0"`.
- [ ] **Step 7:** Update the README/memory notes: the release repo is now `Homefronts/Porchlight`, and the bridge code can be removed once almost everyone has moved.

**Known issues:**
- The old uninstaller kills a running per-machine NUber `ytubic.exe` (rare).
- Linux deb/rpm users keep the old YTubic Plus package; they can remove it themselves.
