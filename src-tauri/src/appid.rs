//! Pins the app's Windows AppUserModelID (AUMID) onto the process.
//!
//! Windows resolves the "source app" name + icon of a System Media Transport
//! Controls tile (the Quick Settings / volume-flyout media card) by taking the
//! media session's AUMID and matching it against a Start Menu shortcut that
//! carries the same AUMID. Tauri's NSIS installer stamps that AUMID — the
//! bundle identifier — onto the shortcuts it creates, so an installed build
//! resolves to "Porchlight" + icon for free.
//!
//! But a media session only carries our AUMID if the *process* has one. A
//! launch that doesn't go through a shortcut (autostart's Run entry, a direct
//! exe run, `tauri dev`) otherwise reports a system-derived AUMID that matches
//! no shortcut, and the tile reads "Unknown app". Setting it explicitly here —
//! to the exact value the installer uses — makes every launch resolve.
//!
//! (The tile itself is created by souvlaki in media.rs; this just gives it an
//! identity Windows can name.) Windows-only; a no-op elsewhere.

/// Pin the app's AUMID onto the process. Call once at the very start of `run()`,
/// before any window is created, so each window (and thus souvlaki's SMTC
/// session) inherits it.
pub fn init() {
    #[cfg(windows)]
    {
        // Must equal the `identifier` in tauri.conf.json: that's the AUMID
        // Tauri's NSIS installer writes onto the Start Menu / desktop shortcuts,
        // and the tile resolves by matching the session's AUMID to a shortcut's.
        // Debug uses a distinct id so a dev run and an installed release don't
        // collide, and a dev-only Start Menu shortcut can carry it.
        #[cfg(not(debug_assertions))]
        const AUMID: &str = "io.github.homefronts.porchlight";
        #[cfg(debug_assertions)]
        const AUMID: &str = "io.github.homefronts.porchlight.dev";

        use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        let wide: Vec<u16> = AUMID.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            // Returns an HRESULT; nothing actionable on failure beyond leaving
            // the default (unresolvable) identity in place.
            let _ = SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
        }
    }
}

/// Windows keeps showing a shortcut's old icon from its cache after an update
/// replaces the exe. Ask it to refresh once per version, so a new icon reaches
/// pinned shortcuts. Best effort; a no-op off Windows.
pub fn refresh_shell_icons_once(data_dir: &std::path::Path, version: &str) {
    #[cfg(windows)]
    {
        let marker = data_dir.join("shell-icons-version");
        if std::fs::read_to_string(&marker).is_ok_and(|seen| seen == version) {
            return;
        }
        use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
        unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED as _, SHCNF_IDLIST, std::ptr::null(), std::ptr::null()) };
        let _ = std::fs::create_dir_all(data_dir);
        let _ = std::fs::write(marker, version);
    }
    #[cfg(not(windows))]
    let _ = (data_dir, version);
}
