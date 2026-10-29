# Porchlight: the new name, a new app ID, and the split from YTubic

## Intent

YTubic Plus started as additions on top of NUber's YTubic. With 0.9.0 it has its own look
(Liner notes), its own feature set and its own release line, so it should stop sharing an
identity with the original. Release **1.0.0** renames the app to **Porchlight** and gives it
its own app ID. People can then run Porchlight and the original YTubic on the same computer
without the two fighting over data, links or the single-window lock.

The user's priority for the switch, in their words: "whatever makes it easier for the end
user to update to the new app ID without having any hitches". Someone on Plus today should
let the auto-updater run and end up in Porchlight with:
- the same login, settings, queue, downloads, looks and Rewind history
- no second copy of the app left behind
- nothing to click

The name means a light left on for you, and evenings on the porch with music playing.

## Goals

- The app is called **Porchlight** everywhere a person sees a name: window and taskbar
  titles, the installer and Start Menu shortcut, the logo ("PORCH / LIGHT." in the Liner
  looks), the Welcome, About, What's New, Discord status, the Windows media controls,
  Linux media controls, the README and the GitHub repo.
- **A new app ID.** Porchlight and NUber's YTubic install, run and keep their data side by
  side.
- **Seamless move for existing Plus users.** One silent auto-update path takes them to
  Porchlight with their data. Porchlight then removes the old Plus install by itself, but
  only after confirming the data arrived. The user sees at most a one-line notice.
- **Old links keep working.** `ytubic-plus://` links (already shared by Plus users) open
  Porchlight, and a new `porchlight://` scheme is added. The share page on GitHub Pages
  points at Porchlight.
- **Credit stays permanently.** README and About keep the NUber / YTubic credit. The Welcome
  shows "FORMERLY YTUBIC PLUS · BUILT ON YTUBIC BY NUBER", a line the themes Welcome
  already reserves for this.
- **The split on GitHub:** the repo leaves NUber's fork network and is renamed. The GPL-3.0
  licence and the credit stay.

## Non-goals

- Changing anything in NUber's YTubic, or migrating its users. Porchlight only ever touches
  data that Plus wrote.
- New features. 1.0.0 is the rename, the ID change and the move; the themes work from 0.9.0
  is already in.
- Layouts (Gatefold, Index, Crate, Panels). They stay on the roadmap.

## Anti-goals (a failure even if it works)

- A Plus user ends up logged out, or loses settings, queue, looks, Rewind history, AI marks
  or downloads.
- Two copies of the app installed after an update (an orphaned "YTubic" next to
  "Porchlight").
- **Porchlight uninstalling or emptying NUber's original YTubic.** Plus and the original
  currently share the same install name ("YTubic") and the same data folders, so anything
  that removes "the YTubic install" or moves "the YTubic data" without proof that it is Plus
  can hit the original.
- Downloads silently using double the disk space for good.
- Plus users stranded on 0.9.x because the update feed broke with the repo rename.
- Media keys, the taskbar tile or links breaking because one copy of the ID wasn't updated.

## What the research found

Research notes: `.superpowers/research/tauri-identifier-change.md` (local). The facts that
shape this design:

- **App data** lives in `<OS data dir>/<identifier>` on every OS. On Windows today that is
  `%APPDATA%\com.github.ivasy.ytubic` and `%LOCALAPPDATA%\com.github.ivasy.ytubic`.
  - On Windows and Linux the WebView's own storage (localStorage, IndexedDB) sits inside
    the local data folder (`EBWebView` on Windows).
  - On macOS it is WKWebView's store, keyed by bundle id, so it resets when the ID changes.
- **Windows NSIS identifies an install by productName (plus manufacturer), not by the
  identifier.**
  - The uninstall key is `…\Uninstall\<productName>`, and the default install dir is
    `%LOCALAPPDATA%\<productName>`.
  - Manufacturer is `publisher` if set, else the second segment of the identifier
    (`github` today).
  - So installing "Porchlight" over "YTubic" creates a **second install**. This is
    inferred from the installer source, not documented, and must be confirmed by testing.
- **NSIS installer hooks** exist (`installerHooks`: PREINSTALL, POSTINSTALL, PREUNINSTALL,
  POSTUNINSTALL). The uninstaller's "delete app data" option deletes
  `%APPDATA%\<id>` and `%LOCALAPPDATA%\<id>`.
- **macOS auto-update replaces the .app in place** (same path, so no second copy), but
  WKWebView storage resets.
- **Linux:** the updater replaces AppImages in place and installs deb/rpm via
  dpkg/rpm. A renamed package sits beside the old one unless Replaces/Conflicts is set.
- **single-instance** keys on the identifier on all OSes, so old and new never block each
  other.
- **deep-link** schemes are registered per scheme name in HKCU (last writer wins).
- There is no official Tauri guidance or known prior art for an identifier change.

### Everything in this codebase tied to the old ID or name

- `src-tauri/tauri.conf.json`: `productName` "YTubic", `identifier`, deep-link schemes,
  the updater endpoint (`github.com/Homefronts/YTubic-Plus/releases/latest/download/latest.json`)
  and pubkey.
- `src-tauri/src/appid.rs`: the Windows AUMID, hard-coded and required to equal the
  identifier so SMTC and taskbar shortcuts resolve (a `.dev` suffix for debug builds).
- `src-tauri/src/lib.rs:166`: `KEYRING_SERVICE` (macOS/Linux keychain entry holding the
  cookie encryption key). On Windows the cookies use DPAPI with a fixed entropy string,
  which is independent of the ID.
- Data under app dirs:
  - `accounts.json`, `accounts/<id>/cookies.enc`, and `accounts/<id>/webview` (login)
  - `downloads/` (offline tracks; about 2.8 GB on the user's machine)
  - Last.fm config (`app_config_dir`), caches, and yt-dlp data
- Frontend persistent state in the WebView:
  - localStorage keys `ytm-*` / `ytubic-*`: settings, playback, looks, layout, theme,
    whats-new, dislikes, pinned playlists, liked cover, playlist sort, AI overrides,
    offline grant, home sections, and more
  - IndexedDB stores `ytubic-stores` (kv: Rewind and other persisted stores) and
    `ytubic-cache` (query cache, safe to drop)
  - cover art cache
- Names: `discord.rs` ("YTubic"), `media.rs` (dbus name `ytubic`, display "YTubic"), the
  window title in `lib.rs`, the Cargo package name `ytubic`, and temp folder prefixes.
- `src/lib/app-name.ts` (`APP_NAME`), the Welcome copy, What's New, README, the issue
  templates, and the share page under `docs/` (GitHub Pages at
  `homefronts.github.io/YTubic-Plus/s/`).

## Decided

1. **Name: Porchlight.** Release **1.0.0**. Version scheme continues from 0.9.x.
2. **New app ID**, separate from `com.github.ivasy.ytubic`.
3. **Two-step move**, so only proven Plus data is ever touched:
   - **0.9.1 "bridge"** (still the old ID and name). It writes a Plus marker file into the
     old app data folder, and exports the WebView's persistent state (localStorage plus
     the persisted IndexedDB stores, not caches) to a handoff file next to it. That is the
     only reliable way to carry WebView storage across an ID change on macOS, and it avoids
     copying WebView internals on Windows and Linux. 0.9.1 keeps the handoff fresh
     (written on quit and before installing an update) and changes nothing else for
     the user. The update feed serves 0.9.1 to everyone on 0.9.0 before 1.0.0 is
     published.
   - **1.0.0 Porchlight** (new ID and name). On first launch, if the old data folder
     has the Plus marker, it:
     - copies login, settings and Last.fm data into its own folders
     - takes over downloads without doubling disk use where it safely can (a same-volume
       move is fine when the original YTubic isn't installed, otherwise copy)
     - imports the handoff file into its WebView storage
     - verifies it is signed in and the data is present
     - removes the old Plus install silently and leaves the old data folders alone for
       NUber's app

     With no marker, it touches nothing.
   - The user sees at most a short "Moved over from YTubic Plus" notice.
4. **Old Plus install is removed automatically** after a verified move. No prompt.
5. **Links:** Porchlight registers `porchlight://` and keeps handling `ytubic-plus://`.
   It no longer claims `ytubic://` (that belongs to the original app).
6. **Credit** stays in README and About, and the Welcome shows the FORMERLY / BUILT ON line.
7. **Bridge code is temporary:** the migration and handoff code come out once almost
   everyone is on Porchlight. When that happens is a later call.
8. **GitHub:** rename the repo to Porchlight and leave NUber's fork network. The update
   feed URL must keep working for 0.9.x clients (GitHub redirects renamed repos; this is
   confirmed before 1.0.0 is published).

## Decided by the user after the builder review

- **The login key travels in the handoff (macOS and Linux).**
  - 0.9.1 puts the cookie encryption key from the keychain into the handoff, so Porchlight
    never reads the old keychain item and no "allow access" prompt appears.
  - The handoff file is readable only by the user's account (owner-only permissions).
  - Porchlight stores the key under its own keychain service, then deletes the handoff
    right after a verified import.
  - The key is on disk only for the moment between the 0.9.1 export and the 1.0.0 import.
  - On Windows, the cookies use DPAPI with a fixed entropy string, so they move as plain
    file copies and no key is involved.

## Settled after the builder review (my calls, from "no hitches")

- **Nobody skips the bridge.** The update feed stays as it is and serves 0.9.1 for good:
  - 0.9.1 points its updater at a new feed URL that serves Porchlight.
  - Every older client (0.8.x, auto-update off, rarely restarted) therefore passes
    through 0.9.1 before it can reach 1.0.0.
  - 1.0.0 never has to guess from unmarked folders.
- **Proof that an install is Plus needs two stamps:**
  - the data marker, and
  - an install stamp that 0.9.1 writes next to its own install (Windows: a value under its
    uninstall key or a file beside the exe; macOS: inside the bundle).
  - Removal needs both. If only the data marker exists (for example, NUber's YTubic was
    reinstalled over Plus later), Porchlight still copies the data, which is
    non-destructive, but never removes that install.
- **"Verified" means the copy and import completed and their contents check out** (files
  match, and the handoff import counts match). It does not depend on being signed in or
  online.
  - On failure, Porchlight keeps the old install and silently retries on the next launch.
  - After three failed launches it shows one plain notice with a "Try again" button and
    a way to report it.
  - Two copies may exist only while a move is unverified.
- **macOS app folder:** Porchlight renames its own bundle to `Porchlight.app` on first
  launch when it can do so without asking for a password. If it can't, it stays as is,
  and a rename is never forced.

## Calls I made (check these)

- **New identifier: `io.github.homefronts.porchlight`.** It keeps the GitHub-owner pattern
  the old ID used, and no domain is needed. If a `porchlight.fm`-style domain is
  registered later, the ID still doesn't need to change.
- **`publisher: "Homefronts"`** set explicitly, so the Windows install identity is stable
  and no longer derived from the identifier.
- The bridge is a separate 0.9.1 release rather than logic inside 1.0.0 that guesses from
  the old folders, because the old folders are shared with NUber's YTubic.
- `ytubic-plus://` stays handled for at least the life of the bridge. The share page keeps
  making Porchlight links (`porchlight://`) with a web fallback.
- macOS and Linux get the same handoff/import path. Linux deb/rpm get Replaces/Conflicts on
  the old package name so the update doesn't leave two packages.

## Left to the builder

- The exact handoff file format, size limits, and what counts as a cache that can be
  dropped.
- How the old Plus install is removed on each OS: running the old uninstaller silently
  (Windows, without its "delete app data" option), deleting the old bundle (macOS; the
  in-place update may already make this a no-op), or package replacement (Linux). Also
  whether that happens from Porchlight on first launch or from an installer hook.
- How "the original YTubic is installed" is detected for the downloads move/copy choice.
- The test matrix and how to produce old-version installs to test against. It must
  include, on Windows:
  - 0.9.0 → 0.9.1 → 1.0.0 by auto-update
  - 1.0.0 fresh install next to NUber's YTubic
  - 1.0.0 fresh install with no YTubic at all

  At least one macOS update run is also required.
- Logo and icon artwork for "Porchlight" within the existing Liner looks.
- Renaming internal identifiers that users never see (Cargo package name, temp folder
  prefixes, dbus name) and the order of the GitHub repo rename versus the 1.0.0 release.
