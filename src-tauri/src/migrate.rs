//! Porchlight first launch: moves a YTubic Plus user's data over from the old
//! app ID's folders and removes the old Plus install. NUber's YTubic shares
//! those folders and the old install slot, so nothing happens without the Plus
//! marker, and the install is removed (and downloads moved) only when it is
//! proven to be Plus. Temporary, like bridge.rs.
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

pub const OLD_IDENTIFIER: &str = "com.github.ivasy.ytubic";
const MARKER: &str = "plus-marker.json";
const INSTALL_STAMP: &str = "plus-install.json";
const HANDOFF: &str = "porchlight-handoff.json";
const STATE: &str = "moved-from-plus.json";
const FAILED_AFTER: u32 = 3;

/// Top-level names in the old data folder that never come over. Downloads are
/// handled on their own, after the uninstall, since they may move instead.
const SKIP: &[&str] = &[MARKER, HANDOFF, "porchlight-handoff.json.tmp", "downloads"];
/// On Linux the data folder is also WebKitGTK's; that storage travels in the handoff.
#[cfg(target_os = "linux")]
const SKIP_WEBVIEW: &[&str] = &[
    "cookies",
    "localstorage",
    "databases",
    "indexeddb",
    "storage",
    "mediakeys",
    "hsts-storage",
    "itp",
    "serviceworkers",
    "deviceidhashsalts",
    "CacheStorage",
    "WebKitCache",
    "applications",
];
#[cfg(not(target_os = "linux"))]
const SKIP_WEBVIEW: &[&str] = &[];

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MoveState {
    NotPlus,
    Done,
    Pending,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Notice {
    Moved,
    Failed,
}

/// `attempts` counts failed copy attempts while `Pending`, and failed
/// uninstall/downloads attempts once `Done`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MoveOutcome {
    pub state: MoveState,
    pub attempts: u32,
    pub notice: Option<Notice>,
}

/// The old Local folder holds only caches and WebView2 internals, so nothing
/// is read from it. Last.fm's queue lives in the config folder, which is the
/// data folder everywhere except Linux.
#[derive(Clone, Debug)]
pub struct MovePaths {
    pub old_roaming: PathBuf,
    pub new_roaming: PathBuf,
    pub old_config: PathBuf,
    pub new_config: PathBuf,
    /// The old per-user install slot, the only thing ever uninstalled.
    pub old_install_dir: Option<PathBuf>,
    pub old_install_stamp: Option<PathBuf>,
    pub old_install_exe: Option<PathBuf>,
    /// The version the slot's uninstall entry reports; `None` skips that check.
    pub old_install_version: Option<String>,
    /// Some other YTubic install (per-machine, a system package) that may read
    /// the old downloads.
    pub other_install: bool,
    pub may_rename_downloads: bool,
}

/// The parts of a move that touch the system, so tests can stand in for them.
pub trait System {
    fn uninstall(&self, dir: &Path) -> Result<(), String>;
    fn old_desktop_shortcut(&self) -> bool;
    fn ensure_shortcuts(&self, desktop: bool) -> Result<(), String>;
    fn store_key(&self, base64: &str) -> Result<(), String>;
}

#[derive(Default)]
struct Found {
    dir: Option<PathBuf>,
    stamp: Option<PathBuf>,
    exe: Option<PathBuf>,
    version: Option<String>,
    other: bool,
}

impl MovePaths {
    pub fn detect(app: &AppHandle) -> Result<MovePaths, String> {
        let old_of = |new: &Path| new.with_file_name(OLD_IDENTIFIER);
        let new_roaming = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let new_config = app.path().app_config_dir().map_err(|e| e.to_string())?;
        let found = old_install();
        #[allow(unused_mut)]
        let mut paths = MovePaths {
            old_roaming: old_of(&new_roaming),
            old_config: old_of(&new_config),
            new_roaming,
            new_config,
            old_install_dir: found.dir,
            old_install_stamp: found.stamp,
            old_install_exe: found.exe,
            old_install_version: found.version,
            other_install: found.other,
            may_rename_downloads: true,
        };
        // Dev runs have their own identifier, but the old folders and install
        // they find are the user's real ones: copy only, never uninstall.
        #[cfg(debug_assertions)]
        {
            paths.old_install_stamp = None;
            paths.may_rename_downloads = false;
        }
        Ok(paths)
    }
}

#[cfg(windows)]
fn old_install() -> Found {
    use win::{key_exists, reg_string, HKEY_CURRENT_USER as HKCU, HKEY_LOCAL_MACHINE as HKLM};
    let dir = install_dir_from(reg_string(HKCU, "InstallLocation"), reg_string(HKCU, "UninstallString"));
    Found {
        stamp: dir.as_ref().map(|d| d.join(INSTALL_STAMP)),
        exe: dir.as_ref().map(|d| d.join("ytubic.exe")),
        // A missing value reads as "", which matches no stamp.
        version: Some(reg_string(HKCU, "DisplayVersion").unwrap_or_default()),
        // Plus only ever installed per user, so a per-machine YTubic is NUber's.
        other: key_exists(HKLM),
        dir,
    }
}

#[cfg(target_os = "macos")]
fn old_install() -> Found {
    // The updater replaces the running bundle in place, so only a second
    // YTubic.app elsewhere is an old install.
    let running = mac::running_bundle().and_then(|b| b.canonicalize().ok());
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let dir = [PathBuf::from("/Applications/YTubic.app"), home.join("Applications/YTubic.app")]
        .into_iter()
        .find(|p| p.exists() && p.canonicalize().ok() != running);
    Found {
        stamp: dir.as_ref().map(|d| d.join("Contents/Resources").join(INSTALL_STAMP)),
        exe: dir.as_ref().map(|d| d.join("Contents/MacOS/ytubic")),
        version: None,
        other: false,
        dir,
    }
}

/// deb/rpm are swapped by the package's Replaces, and an AppImage updates in
/// place, so there is never an old Plus install to remove. A YTubic binary on
/// the system is NUber's package, which still reads the old downloads.
// shortcut: an AppImage of NUber's app can't be detected and counts as no
// install, so downloads move; check a known AppImage path if that's reported.
#[cfg(not(any(windows, target_os = "macos")))]
fn old_install() -> Found {
    Found { other: Path::new("/usr/bin/ytubic").exists(), ..Found::default() }
}

/// `InstallLocation`, or the folder of `UninstallString`; NSIS writes both quoted.
#[cfg_attr(not(windows), allow(dead_code))]
fn install_dir_from(location: Option<String>, uninstall_string: Option<String>) -> Option<PathBuf> {
    let unquote = |s: String| Some(s.trim().trim_matches('"').to_string()).filter(|s| !s.is_empty());
    location.and_then(unquote).map(PathBuf::from).or_else(|| {
        let exe = PathBuf::from(uninstall_string.and_then(unquote)?);
        exe.parent().map(Path::to_path_buf)
    })
}

/// The slot holds Plus only if its stamp is Plus's, matches the installed
/// version, and is newer than the exe. 0.9.1 rewrites the stamp on every
/// launch; NUber's installer rewrites the exe and leaves a stale stamp behind.
fn proven_plus(paths: &MovePaths) -> bool {
    let (Some(stamp), Some(exe)) = (&paths.old_install_stamp, &paths.old_install_exe) else {
        return false;
    };
    let Some(v) = read_json(stamp).filter(|v| v["app"] == "ytubic-plus") else {
        return false;
    };
    if paths.old_install_version.as_ref().is_some_and(|ver| v["version"] != ver.as_str()) {
        return false;
    }
    let mtime = |p: &Path| fs::metadata(p).and_then(|m| m.modified()).ok();
    matches!((mtime(stamp), mtime(exe)), (Some(s), Some(e)) if s >= e)
}

/// The move's progress, kept in `moved-from-plus.json` in the new data folder.
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Record {
    /// "pending" until the files are in, then "done".
    state: String,
    attempts: u32,
    key_stored: bool,
    had_desktop: bool,
    uninstalled: bool,
    cleanup_attempts: u32,
    /// "moved" or "copied" once taken.
    #[serde(skip_serializing_if = "Option::is_none")]
    downloads: Option<String>,
    frontend_imported: bool,
    at: String,
}

impl Record {
    fn load(dir: &Path) -> Record {
        fs::read(dir.join(STATE))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    fn done(&self) -> bool {
        self.state == "done"
    }

    fn save(&mut self, dir: &Path) -> Result<(), String> {
        self.at = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();
        let body = serde_json::to_vec(self).map_err(|e| e.to_string())?;
        write_atomic(&dir.join(STATE), &body)
    }

    fn save_logged(&mut self, dir: &Path) {
        if let Err(e) = self.save(dir) {
            eprintln!("[migrate] state not saved: {e}");
        }
    }
}

fn outcome(state: MoveState, attempts: u32, notice: Option<Notice>) -> MoveOutcome {
    MoveOutcome { state, attempts, notice }
}

/// a. files in and verified, key stored, `done` (the import may start);
/// b. a proven Plus install uninstalled; c. downloads moved or copied.
/// Each step is recorded, so a crash anywhere resumes at the step it reached.
pub fn run(paths: &MovePaths, sys: &dyn System) -> MoveOutcome {
    if !read_json(&paths.old_roaming.join(MARKER)).is_some_and(|v| v["app"] == "ytubic-plus") {
        return outcome(MoveState::NotPlus, 0, None);
    }
    let dir = &paths.new_roaming;
    let mut rec = Record::load(dir);
    let mut notice = None;
    if !rec.done() {
        if let Err(e) = copy_files(paths, sys, &mut rec) {
            eprintln!("[migrate] move from YTubic Plus failed: {e}");
            rec.state = "pending".into();
            rec.attempts += 1;
            rec.save_logged(dir);
            let notice = (rec.attempts >= FAILED_AFTER).then_some(Notice::Failed);
            return outcome(MoveState::Pending, rec.attempts, notice);
        }
        notice = Some(Notice::Moved);
    }

    let (mut failed, mut dirty, mut uninstalled_now) = (false, false, false);
    if !rec.uninstalled && proven_plus(paths) {
        if let Some(old) = &paths.old_install_dir {
            // Recorded first, so a crash mid-uninstall still makes the shortcut.
            if sys.old_desktop_shortcut() && !rec.had_desktop {
                rec.had_desktop = true;
                rec.save_logged(dir);
            }
            match sys.uninstall(old) {
                Ok(()) => (rec.uninstalled, uninstalled_now) = (true, true),
                Err(e) => {
                    eprintln!("[migrate] old install not removed: {e}");
                    failed = true;
                }
            }
            dirty = true;
        }
    }

    if rec.downloads.is_none() {
        // Only rename when nothing else can still read the old folder.
        let install_gone = paths.old_install_dir.is_none() || uninstalled_now;
        let may_move = paths.may_rename_downloads && !paths.other_install && install_gone;
        match take_downloads(
            &paths.old_roaming.join("downloads"),
            &dir.join("downloads"),
            may_move,
        ) {
            Ok(moved) => rec.downloads = Some(if moved { "moved" } else { "copied" }.into()),
            Err(e) => {
                eprintln!("[migrate] downloads not taken: {e}");
                failed = true;
            }
        }
        dirty = true;
    }

    if failed {
        rec.cleanup_attempts += 1;
    }
    if rec.uninstalled || paths.old_install_dir.is_none() {
        match sys.ensure_shortcuts(rec.had_desktop) {
            Ok(()) if rec.had_desktop => (rec.had_desktop, dirty) = (false, true),
            Ok(()) => {}
            Err(e) => eprintln!("[migrate] shortcuts not made: {e}"),
        }
    }
    if dirty {
        rec.save_logged(dir);
    }
    if failed && rec.cleanup_attempts >= FAILED_AFTER {
        notice = Some(Notice::Failed);
    }
    outcome(MoveState::Done, rec.cleanup_attempts, notice)
}

fn copy_files(paths: &MovePaths, sys: &dyn System, rec: &mut Record) -> Result<(), String> {
    let dir = &paths.new_roaming;
    rec.state = "pending".into();
    rec.save(dir)?;
    let mut copied = Vec::new();
    copy_tree(&paths.old_roaming, dir, true, &mut copied)?;
    if paths.old_config != paths.old_roaming {
        copy_tree(&paths.old_config, &paths.new_config, true, &mut copied)?;
    }
    verify(&copied)?;
    // A bad handoff only means there is nothing to import.
    match read_handoff(&paths.old_roaming) {
        Ok(Some(handoff)) => {
            if let Some(key) = handoff["cookieKey"].as_str() {
                // Never again once stored: by then Porchlight may have made its own.
                if !rec.key_stored {
                    sys.store_key(key)?;
                    rec.key_stored = true;
                    rec.save(dir)?;
                }
                if let Err(e) = strip_key(&paths.old_roaming, handoff) {
                    eprintln!("[migrate] key left in the handoff: {e}");
                }
            }
        }
        Ok(None) => {}
        Err(e) => eprintln!("[migrate] {e}; nothing to import"),
    }
    rec.state = "done".into();
    rec.save(dir)
}

/// Proves only the copies made in this run: an earlier run's files were checked then.
fn verify(copied: &[(PathBuf, u64)]) -> Result<(), String> {
    for (path, len) in copied {
        if fs::metadata(path).map(|m| m.len()).ok() != Some(*len) {
            return Err(format!("{} did not copy intact", path.display()));
        }
    }
    Ok(())
}

/// The handoff's frontend data, served until the import is acknowledged, and
/// only once the files are in.
fn handoff_frontend(paths: &MovePaths) -> Option<Value> {
    let rec = Record::load(&paths.new_roaming);
    if !rec.done() || rec.frontend_imported {
        return None;
    }
    read_handoff(&paths.old_roaming).ok()??.get_mut("frontend").map(Value::take)
}

/// Deletes the handoff and records the import.
fn ack_import(paths: &MovePaths) -> Result<(), String> {
    match fs::remove_file(paths.old_roaming.join(HANDOFF)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(format!("handoff: {e}")),
        _ => {}
    }
    let mut rec = Record::load(&paths.new_roaming);
    rec.frontend_imported = true;
    rec.save(&paths.new_roaming)
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn read_handoff(dir: &Path) -> Result<Option<Value>, String> {
    let bytes = match fs::read(dir.join(HANDOFF)) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("handoff: {e}")),
    };
    let v: Value = serde_json::from_slice(&bytes).map_err(|e| format!("handoff: {e}"))?;
    if v["format"] != 1 {
        return Err("handoff: unknown format".into());
    }
    Ok(Some(v))
}

/// The key now lives in the keychain, so it must not stay on disk.
fn strip_key(dir: &Path, mut handoff: Value) -> Result<(), String> {
    if let Some(fields) = handoff.as_object_mut() {
        fields.remove("cookieKey");
    }
    write_atomic(&dir.join(HANDOFF), handoff.to_string().as_bytes())
}

/// Owner-only on unix, written beside then renamed, so a crash never leaves half a file.
fn write_atomic(path: &Path, body: &[u8]) -> Result<(), String> {
    let at = |e: std::io::Error| format!("{}: {e}", path.display());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(at)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    // A leftover file could keep looser permissions; the mode only applies on create.
    let _ = fs::remove_file(&tmp);
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
    let mut file = opts.open(&tmp).map_err(at)?;
    file.write_all(body).map_err(at)?;
    drop(file);
    fs::rename(&tmp, path).map_err(at)
}

/// Copies files, recording each with its size for the check. A file already
/// at the destination that is as new as the source (an earlier attempt's copy,
/// or something Porchlight wrote since) is left alone.
fn copy_tree(src: &Path, dst: &Path, top: bool, copied: &mut Vec<(PathBuf, u64)>) -> Result<(), String> {
    let at = |p: &Path, e: std::io::Error| format!("{}: {e}", p.display());
    let entries = match fs::read_dir(src) {
        Ok(entries) => entries,
        Err(e) if top && e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(at(src, e)),
    };
    fs::create_dir_all(dst).map_err(|e| at(dst, e))?;
    for entry in entries {
        let entry = entry.map_err(|e| at(src, e))?;
        let name = entry.file_name();
        if top && skipped(&name) {
            continue;
        }
        let (from, to) = (entry.path(), dst.join(&name));
        // DirEntry metadata does not follow links, so links are skipped.
        let meta = entry.metadata().map_err(|e| at(&from, e))?;
        if meta.is_dir() {
            copy_tree(&from, &to, false, copied)?;
        } else if meta.is_file() && !up_to_date(&to, &meta) {
            // Through a temp name, so a killed copy never leaves a partial file
            // under the real one.
            let mut part = name.clone();
            part.push(".porchlight-part");
            let part = dst.join(part);
            if let Err(e) = fs::copy(&from, &part).and_then(|_| fs::rename(&part, &to)) {
                let _ = fs::remove_file(&part);
                return Err(at(&to, e));
            }
            copied.push((to, meta.len()));
        }
    }
    Ok(())
}

fn skipped(name: &OsStr) -> bool {
    SKIP.iter().chain(SKIP_WEBVIEW).any(|s| name == *s)
}

fn up_to_date(dst: &Path, src: &fs::Metadata) -> bool {
    match (fs::metadata(dst), src.modified()) {
        (Ok(d), Ok(s)) if d.is_file() => d.modified().is_ok_and(|d| d >= s),
        _ => false,
    }
}

/// Renames the folder across when allowed (instant on one volume), else
/// copies. True when nothing is left at the source.
fn take_downloads(src: &Path, dst: &Path, may_move: bool) -> Result<bool, String> {
    if !src.is_dir() {
        return Ok(true);
    }
    if may_move {
        // downloads::init leaves empty folders behind on a launch before this.
        if holds_no_files(dst) {
            let _ = fs::remove_dir_all(dst);
        }
        if !dst.exists() && fs::rename(src, dst).is_ok() {
            return Ok(true);
        }
    }
    let started = std::time::Instant::now();
    let mut copied = Vec::new();
    copy_tree(src, dst, false, &mut copied)?;
    verify(&copied)?;
    eprintln!("[migrate] copied downloads in {:?}", started.elapsed());
    Ok(false)
}

/// True for an existing folder tree with no files in it.
fn holds_no_files(dir: &Path) -> bool {
    fs::read_dir(dir).is_ok_and(|entries| {
        entries.into_iter().all(|e| {
            e.is_ok_and(|e| e.file_type().is_ok_and(|t| t.is_dir()) && holds_no_files(&e.path()))
        })
    })
}

struct RealSystem {
    identifier: String,
}

impl System for RealSystem {
    fn uninstall(&self, dir: &Path) -> Result<(), String> {
        uninstall_old(dir)
    }
    fn old_desktop_shortcut(&self) -> bool {
        old_desktop_shortcut()
    }
    fn ensure_shortcuts(&self, desktop: bool) -> Result<(), String> {
        ensure_shortcuts(desktop, &self.identifier)
    }
    fn store_key(&self, base64: &str) -> Result<(), String> {
        crate::secure_store::store_cookie_key_base64(base64)
    }
}

#[cfg(windows)]
fn old_desktop_shortcut() -> bool {
    win::on_desktop("YTubic.lnk")
}

#[cfg(not(windows))]
fn old_desktop_shortcut() -> bool {
    false
}

#[cfg(all(windows, not(debug_assertions)))]
fn ensure_shortcuts(desktop: bool, aumid: &str) -> Result<(), String> {
    win::ensure_shortcuts(desktop, aumid)
}

/// A dev build must not point the real Start entry at itself.
#[cfg(not(all(windows, not(debug_assertions))))]
fn ensure_shortcuts(_desktop: bool, _aumid: &str) -> Result<(), String> {
    Ok(())
}

/// Windows runs the old NSIS uninstaller, macOS removes the old bundle, Linux
/// has nothing to remove (see `old_install`).
#[cfg(windows)]
fn uninstall_old(dir: &Path) -> Result<(), String> {
    win::uninstall(dir)
}

#[cfg(target_os = "macos")]
fn uninstall_old(dir: &Path) -> Result<(), String> {
    let running = mac::running_bundle().and_then(|b| b.canonicalize().ok());
    if dir.canonicalize().ok() == running {
        return Ok(());
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

#[cfg(not(any(windows, target_os = "macos")))]
fn uninstall_old(_dir: &Path) -> Result<(), String> {
    Ok(())
}

/// Where `bundle` should be renamed to, if anywhere.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn mac_rename_target(bundle: &Path, parent_writable: bool) -> Option<PathBuf> {
    let target = bundle.with_file_name("Porchlight.app");
    (parent_writable && bundle.file_name() != target.file_name() && !target.exists()).then_some(target)
}

#[cfg(target_os = "macos")]
mod mac {
    use std::path::PathBuf;

    /// <bundle>/Contents/MacOS/<exe> -> <bundle>
    pub fn running_bundle() -> Option<PathBuf> {
        let exe = std::env::current_exe().ok()?;
        let bundle = exe.parent()?.parent()?.parent()?.to_path_buf();
        (bundle.extension()? == "app").then_some(bundle)
    }

    /// Renames the running bundle to Porchlight.app and relaunches from there,
    /// only when the folder takes a write without a password prompt.
    pub fn rename_and_relaunch() {
        let Some(bundle) = running_bundle() else { return };
        let Some(parent) = bundle.parent() else { return };
        let probe = parent.join(".porchlight-write-probe");
        let writable = std::fs::write(&probe, b"").is_ok();
        let _ = std::fs::remove_file(&probe);
        let Some(target) = super::mac_rename_target(&bundle, writable) else { return };
        if let Err(e) = std::fs::rename(&bundle, &target) {
            eprintln!("[migrate] bundle rename failed: {e}");
            return;
        }
        // The delay lets this instance exit first, so single-instance doesn't
        // hand the new launch back to it.
        let spawned = std::process::Command::new("/bin/sh")
            .args(["-c", "sleep 1; open \"$0\""])
            .arg(&target)
            .spawn();
        if spawned.is_ok() {
            std::process::exit(0);
        }
    }
}

#[cfg(windows)]
mod win {
    use std::path::{Path, PathBuf};
    use std::time::{Duration, Instant};

    use windows::core::{Interface, HSTRING};
    pub use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegGetValueW, RegOpenKeyExW, HKEY, KEY_READ, RRF_RT_REG_SZ,
    };

    const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\YTubic";

    pub fn reg_string(root: HKEY, name: &str) -> Option<String> {
        let (key, name) = (HSTRING::from(UNINSTALL_KEY), HSTRING::from(name));
        let mut len = 0u32;
        unsafe {
            RegGetValueW(root, &key, &name, RRF_RT_REG_SZ, None, None, Some(&mut len))
                .ok()
                .ok()?;
            let mut buf = vec![0u16; len as usize / 2 + 1];
            RegGetValueW(root, &key, &name, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut len))
                .ok()
                .ok()?;
            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            Some(String::from_utf16_lossy(&buf[..end]))
        }
    }

    pub fn key_exists(root: HKEY) -> bool {
        let mut key = HKEY::default();
        unsafe {
            let open = RegOpenKeyExW(root, &HSTRING::from(UNINSTALL_KEY), None, KEY_READ, &mut key);
            if open.is_ok() {
                let _ = RegCloseKey(key);
            }
            open.is_ok()
        }
    }

    fn known_folder(id: &windows::core::GUID) -> Option<PathBuf> {
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::{SHGetKnownFolderPath, KF_FLAG_DEFAULT};
        unsafe {
            let p = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
            let path = p.to_string().ok().map(PathBuf::from);
            CoTaskMemFree(Some(p.0 as _));
            path
        }
    }

    pub fn on_desktop(name: &str) -> bool {
        use windows::Win32::UI::Shell::FOLDERID_Desktop;
        known_folder(&FOLDERID_Desktop).is_some_and(|d| d.join(name).exists())
    }

    pub fn uninstall(dir: &Path) -> Result<(), String> {
        let status = std::process::Command::new(dir.join("uninstall.exe"))
            .arg("/S")
            .status()
            .map_err(|e| format!("old uninstaller: {e}"))?;
        if !status.success() {
            return Err(format!("old uninstaller exited with {status}"));
        }
        // NSIS relaunches itself from %TEMP%, so the first process exits before it's done.
        let deadline = Instant::now() + Duration::from_secs(30);
        while key_exists(HKEY_CURRENT_USER) {
            if Instant::now() > deadline {
                return Err("old uninstaller did not finish".into());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        Ok(())
    }

    /// The updater's /UPDATE install makes no shortcuts, and the old uninstall
    /// removed YTubic's, so without these the app has no Start entry and the
    /// media tile has no shortcut to resolve its AUMID against.
    #[cfg_attr(debug_assertions, allow(dead_code))]
    pub fn ensure_shortcuts(desktop: bool, aumid: &str) -> Result<(), String> {
        use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_Programs};
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut folders = vec![known_folder(&FOLDERID_Programs)];
        if desktop {
            folders.push(known_folder(&FOLDERID_Desktop));
        }
        for folder in folders.into_iter().flatten() {
            let lnk = folder.join("Porchlight.lnk");
            if !lnk.exists() {
                create_shortcut(&lnk, &exe, aumid).map_err(|e| format!("{}: {e}", lnk.display()))?;
            }
        }
        Ok(())
    }

    #[cfg_attr(debug_assertions, allow(dead_code))]
    fn create_shortcut(lnk: &Path, target: &Path, aumid: &str) -> windows::core::Result<()> {
        use std::mem::ManuallyDrop;
        use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
        use windows::Win32::System::Com::StructuredStorage::{
            PropVariantClear, PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::System::Variant::VT_LPWSTR;
        use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
        use windows::Win32::UI::Shell::{IShellLinkW, SHStrDupW, ShellLink};
        unsafe {
            // S_FALSE (already initialised here) also needs the matching uninit.
            let inited = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
            let result = (|| {
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                link.SetPath(&HSTRING::from(target.as_os_str()))?;
                if let Some(dir) = target.parent() {
                    link.SetWorkingDirectory(&HSTRING::from(dir.as_os_str()))?;
                }
                // The shell wants VT_LPWSTR here; the string is CoTaskMem, freed by the clear.
                let mut id = PROPVARIANT {
                    Anonymous: PROPVARIANT_0 {
                        Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                            vt: VT_LPWSTR,
                            wReserved1: 0,
                            wReserved2: 0,
                            wReserved3: 0,
                            Anonymous: PROPVARIANT_0_0_0 { pwszVal: SHStrDupW(&HSTRING::from(aumid))? },
                        }),
                    },
                };
                let store: IPropertyStore = link.cast()?;
                let set = store.SetValue(&PKEY_AppUserModel_ID, &id);
                let _ = PropVariantClear(&mut id);
                set?;
                store.Commit()?;
                link.cast::<IPersistFile>()?.Save(&HSTRING::from(lnk.as_os_str()), true)
            })();
            if inited {
                CoUninitialize();
            }
            result
        }
    }
}

/// What this launch's move did, for the frontend notice.
pub struct MoveCell(Mutex<MoveOutcome>);

static MOVING: Mutex<()> = Mutex::new(());

fn move_now(app: &AppHandle, at_launch: bool) -> MoveOutcome {
    let _one_at_a_time = MOVING.lock().unwrap_or_else(|e| e.into_inner());
    let sys = RealSystem { identifier: app.config().identifier.clone() };
    match MovePaths::detect(app) {
        Ok(mut paths) => {
            // After launch the downloads module has the folder open: copy, never rename.
            paths.may_rename_downloads &= at_launch;
            run(&paths, &sys)
        }
        Err(e) => {
            eprintln!("[migrate] paths unavailable: {e}");
            outcome(MoveState::NotPlus, 0, None)
        }
    }
}

/// Runs in setup, before anything reads the data folder; the frontend's calls
/// queue behind setup, so the result is ready when it asks.
pub fn start(app: &AppHandle) {
    let outcome = move_now(app, true);
    eprintln!("[migrate] {outcome:?}");
    // Not on the launch that moved, so the first run isn't interrupted.
    #[cfg(target_os = "macos")]
    if outcome.state == MoveState::Done && outcome.notice.is_none() {
        mac::rename_and_relaunch();
    }
    app.manage(MoveCell(Mutex::new(outcome)));
}

/// The Plus handoff's `frontend` object to import, or null. Returns the same
/// data on every call until `ack_handoff_imported`.
#[tauri::command]
pub fn take_handoff_frontend(app: AppHandle) -> Option<Value> {
    handoff_frontend(&MovePaths::detect(&app).ok()?)
}

/// Call after a successful import: deletes the handoff and records the import.
#[tauri::command]
pub fn ack_handoff_imported(app: AppHandle) -> Result<(), String> {
    ack_import(&MovePaths::detect(&app)?)
}

#[tauri::command]
pub fn move_status(cell: State<'_, MoveCell>) -> MoveOutcome {
    cell.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub async fn retry_move(app: AppHandle) -> Result<MoveOutcome, String> {
    let handle = app.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || move_now(&handle, false))
        .await
        .map_err(|e| e.to_string())?;
    *app.state::<MoveCell>().0.lock().unwrap_or_else(|e| e.into_inner()) = outcome.clone();
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::time::{Duration, SystemTime};

    const STAMP: &str = r#"{"app":"ytubic-plus","version":"0.9.1"}"#;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("migrate-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn put(path: &Path, body: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    fn shift_mtime(path: &Path, secs: i64) {
        let delta = Duration::from_secs(secs.unsigned_abs());
        let t = if secs >= 0 { SystemTime::now() + delta } else { SystemTime::now() - delta };
        fs::File::options().write(true).open(path).unwrap().set_modified(t).unwrap();
    }

    /// Stands in for the uninstaller, shortcuts and keychain.
    #[derive(Default)]
    struct Fake {
        uninstalls: RefCell<Vec<PathBuf>>,
        fail_uninstall: Cell<bool>,
        old_desktop: bool,
        shortcuts: RefCell<Vec<bool>>,
        keys: RefCell<Vec<String>>,
        /// Whether this path still existed when the uninstall ran.
        watch: Option<PathBuf>,
        watched: RefCell<Vec<bool>>,
    }

    impl System for Fake {
        fn uninstall(&self, dir: &Path) -> Result<(), String> {
            if let Some(w) = &self.watch {
                self.watched.borrow_mut().push(w.exists());
            }
            if self.fail_uninstall.get() {
                return Err("uninstaller missing".into());
            }
            self.uninstalls.borrow_mut().push(dir.to_path_buf());
            Ok(())
        }
        fn old_desktop_shortcut(&self) -> bool {
            self.old_desktop
        }
        fn ensure_shortcuts(&self, desktop: bool) -> Result<(), String> {
            self.shortcuts.borrow_mut().push(desktop);
            Ok(())
        }
        fn store_key(&self, key: &str) -> Result<(), String> {
            self.keys.borrow_mut().push(key.to_string());
            Ok(())
        }
    }

    /// A Plus user's old folders and a proven Plus install.
    fn plus_tree(name: &str) -> MovePaths {
        let root = scratch(name);
        let old = root.join("old-roaming");
        let new = root.join("new-roaming");
        let install = root.join("install");
        put(&old.join(MARKER), STAMP);
        put(&old.join("accounts.json"), r#"{"accounts":[]}"#);
        put(&old.join("accounts/acct-1/cookies.enc"), "jar");
        put(&old.join("bin/yt-dlp.exe"), "binary");
        put(&old.join("settings.json"), "{}");
        put(&old.join("downloads/index.json"), r#"{"version":1}"#);
        put(&old.join("downloads/tracks/a.m4a"), "audio");
        put(
            &old.join(HANDOFF),
            r#"{"format":1,"frontend":{"localStorage":{"k":"v"},"idb":{}},"cookieKey":null}"#,
        );
        put(&install.join("ytubic.exe"), "exe");
        shift_mtime(&install.join("ytubic.exe"), -3600);
        put(&install.join(INSTALL_STAMP), STAMP);
        MovePaths {
            old_config: old.clone(),
            new_config: new.clone(),
            old_roaming: old,
            new_roaming: new,
            old_install_stamp: Some(install.join(INSTALL_STAMP)),
            old_install_exe: Some(install.join("ytubic.exe")),
            old_install_version: Some("0.9.1".into()),
            old_install_dir: Some(install),
            other_install: false,
            may_rename_downloads: true,
        }
    }

    fn state(paths: &MovePaths) -> Value {
        serde_json::from_str(&fs::read_to_string(paths.new_roaming.join(STATE)).unwrap()).unwrap()
    }

    fn old_track(paths: &MovePaths) -> bool {
        paths.old_roaming.join("downloads/tracks/a.m4a").exists()
    }

    fn new_track(paths: &MovePaths) -> bool {
        paths.new_roaming.join("downloads/tracks/a.m4a").exists()
    }

    /// The old install must be left alone and downloads copied.
    fn assert_copy_only(paths: &MovePaths, fake: &Fake) {
        assert!(fake.uninstalls.borrow().is_empty());
        assert!(old_track(paths) && new_track(paths));
        assert_eq!(state(paths)["downloads"], "copied");
    }

    #[test]
    fn not_plus_without_marker() {
        let paths = plus_tree("not-plus");
        fs::remove_file(paths.old_roaming.join(MARKER)).unwrap();
        let fake = Fake::default();
        let out = run(&paths, &fake);
        assert_eq!(out.state, MoveState::NotPlus);
        assert_eq!(out.notice, None);
        assert!(!paths.new_roaming.exists());
        assert!(paths.old_roaming.join(HANDOFF).exists());
        assert!(fake.uninstalls.borrow().is_empty() && fake.shortcuts.borrow().is_empty());
    }

    #[test]
    fn copies_and_uninstalls_with_both_stamps() {
        let paths = plus_tree("both-stamps");
        let fake = Fake::default();
        let out = run(&paths, &fake);
        assert_eq!(out.state, MoveState::Done);
        assert_eq!(out.notice, Some(Notice::Moved));
        assert_eq!(*fake.uninstalls.borrow(), vec![paths.old_install_dir.clone().unwrap()]);
        let st = state(&paths);
        assert_eq!((st["state"].as_str(), st["uninstalled"].as_bool()), (Some("done"), Some(true)));
        assert!(st["at"].as_str().is_some_and(|s| s.contains('T')));
        let (old, new) = (&paths.old_roaming, &paths.new_roaming);
        for f in ["accounts.json", "accounts/acct-1/cookies.enc", "bin/yt-dlp.exe", "settings.json"] {
            assert_eq!(fs::read(old.join(f)).unwrap(), fs::read(new.join(f)).unwrap(), "{f}");
        }
        // Plus owned the old slot, so downloads move instead of doubling.
        assert!(new_track(&paths) && !old.join("downloads").exists());
        assert_eq!(st["downloads"], "moved");
        assert!(!new.join(MARKER).exists() && !new.join(HANDOFF).exists());
        assert!(old.join(MARKER).exists(), "the old folder is otherwise left alone");
        assert_eq!(handoff_frontend(&paths).unwrap()["localStorage"]["k"], "v");

        let again = run(&paths, &fake);
        assert_eq!((again.state, again.notice), (MoveState::Done, None));
        assert_eq!(fake.uninstalls.borrow().len(), 1);
    }

    #[test]
    fn copies_but_never_uninstalls_without_install_stamp() {
        let paths = plus_tree("no-stamp");
        // NUber's YTubic was installed over Plus and the stamp went with it.
        fs::remove_file(paths.old_install_stamp.as_ref().unwrap()).unwrap();
        let fake = Fake::default();
        assert_eq!(run(&paths, &fake).state, MoveState::Done);
        assert!(paths.new_roaming.join("accounts.json").exists());
        assert_copy_only(&paths, &fake);
    }

    #[test]
    fn stamp_version_mismatch_means_not_plus_install() {
        let mut paths = plus_tree("version");
        paths.old_install_version = Some("0.9.0".into());
        let fake = Fake::default();
        assert_eq!(run(&paths, &fake).state, MoveState::Done);
        assert_copy_only(&paths, &fake);
    }

    #[test]
    fn exe_newer_than_stamp_means_not_plus_install() {
        let paths = plus_tree("exe-newer");
        // NUber's installer rewrote the exe and left the Plus stamp behind.
        shift_mtime(paths.old_install_exe.as_ref().unwrap(), 3600);
        let fake = Fake::default();
        assert_eq!(run(&paths, &fake).state, MoveState::Done);
        assert_copy_only(&paths, &fake);
    }

    #[test]
    fn other_install_means_copy_only() {
        let mut paths = plus_tree("other");
        // No per-user slot, but a per-machine (or system) YTubic is present.
        (paths.old_install_dir, paths.old_install_stamp, paths.old_install_exe) = (None, None, None);
        paths.other_install = true;
        let fake = Fake::default();
        assert_eq!(run(&paths, &fake).state, MoveState::Done);
        assert_copy_only(&paths, &fake);
    }

    #[test]
    fn retry_never_renames_downloads() {
        let mut paths = plus_tree("retry");
        paths.may_rename_downloads = false;
        let fake = Fake::default();
        run(&paths, &fake);
        assert_eq!(fake.uninstalls.borrow().len(), 1);
        assert!(old_track(&paths) && new_track(&paths));
        assert_eq!(state(&paths)["downloads"], "copied");
    }

    #[test]
    fn verifies_without_accounts() {
        let paths = plus_tree("no-accounts");
        fs::remove_file(paths.old_roaming.join("accounts.json")).unwrap();
        fs::remove_dir_all(paths.old_roaming.join("accounts")).unwrap();
        let out = run(&paths, &Fake::default());
        assert_eq!(out.state, MoveState::Done);
        assert_eq!(state(&paths)["state"], "done");
    }

    #[test]
    fn pending_reruns_idempotently() {
        let paths = plus_tree("rerun");
        let new = &paths.new_roaming;
        // An earlier launch failed part way, then Porchlight ran on what it had.
        put(&new.join(STATE), r#"{"state":"pending","attempts":1}"#);
        put(&new.join("accounts.json"), r#"{"accounts":[]}"#);
        put(&new.join("settings.json"), r#"{"changed":"in porchlight"}"#);
        fs::create_dir_all(new.join("downloads/tracks")).unwrap();
        let fake = Fake::default();
        let out = run(&paths, &fake);
        assert_eq!((out.state, out.notice), (MoveState::Done, Some(Notice::Moved)));
        assert_eq!(state(&paths)["attempts"], 1);
        assert!(new.join("accounts/acct-1/cookies.enc").exists());
        assert_eq!(
            fs::read_to_string(new.join("settings.json")).unwrap(),
            r#"{"changed":"in porchlight"}"#,
            "a newer file Porchlight wrote is kept"
        );
        assert!(new_track(&paths) && !paths.old_roaming.join("downloads").exists());
        assert_eq!(run(&paths, &fake).state, MoveState::Done);
        assert_eq!(fake.uninstalls.borrow().len(), 1);
    }

    #[test]
    fn leftover_part_file_is_replaced() {
        let paths = plus_tree("part");
        // A copy killed mid-way left only the temp name behind.
        put(&paths.new_roaming.join("accounts.json.porchlight-part"), "{\"acc");
        run(&paths, &Fake::default());
        assert_eq!(
            fs::read_to_string(paths.new_roaming.join("accounts.json")).unwrap(),
            r#"{"accounts":[]}"#
        );
        assert!(!paths.new_roaming.join("accounts.json.porchlight-part").exists());
    }

    #[test]
    fn copy_error_keeps_old_install() {
        let paths = plus_tree("copy-error");
        // A folder where a file has to go: that copy cannot succeed.
        fs::create_dir_all(paths.new_roaming.join("accounts.json")).unwrap();
        let fake = Fake::default();
        let out = run(&paths, &fake);
        assert_eq!((out.state, out.attempts, out.notice), (MoveState::Pending, 1, None));
        assert!(fake.uninstalls.borrow().is_empty());
        assert_eq!(state(&paths)["state"], "pending");
        assert!(handoff_frontend(&paths).is_none(), "no import before the files are in");
        let old = &paths.old_roaming;
        for f in ["accounts.json", "downloads/tracks/a.m4a", HANDOFF, MARKER] {
            assert!(old.join(f).exists(), "{f}");
        }
    }

    #[test]
    fn corrupt_handoff_does_not_block_files() {
        let paths = plus_tree("corrupt");
        put(&paths.old_roaming.join(HANDOFF), "not json");
        let fake = Fake::default();
        let out = run(&paths, &fake);
        assert_eq!((out.state, out.notice), (MoveState::Done, Some(Notice::Moved)));
        assert!(paths.new_roaming.join("accounts/acct-1/cookies.enc").exists());
        assert!(handoff_frontend(&paths).is_none());
        assert_eq!(fake.uninstalls.borrow().len(), 1);
    }

    #[test]
    fn failed_notice_after_three_attempts() {
        let paths = plus_tree("three");
        fs::create_dir_all(paths.new_roaming.join("accounts.json")).unwrap();
        let fake = Fake::default();
        let notices: Vec<_> = (0..3).map(|_| run(&paths, &fake).notice).collect();
        assert_eq!(notices, vec![None, None, Some(Notice::Failed)]);
        assert_eq!(state(&paths)["attempts"], 3);
    }

    #[test]
    fn uninstall_failure_keeps_data_done_and_retries() {
        let paths = plus_tree("uninstall-fails");
        let fake = Fake::default();
        fake.fail_uninstall.set(true);
        let first = run(&paths, &fake);
        assert_eq!((first.state, first.notice), (MoveState::Done, Some(Notice::Moved)));
        let st = state(&paths);
        assert_eq!((st["uninstalled"].as_bool(), st["cleanupAttempts"].as_u64()), (Some(false), Some(1)));
        assert!(handoff_frontend(&paths).is_some(), "the import doesn't wait for the uninstall");
        // The old Plus is still there and still reads its downloads.
        assert!(old_track(&paths) && new_track(&paths));
        assert!(fake.shortcuts.borrow().is_empty());
        assert_eq!(run(&paths, &fake).notice, None);
        assert_eq!(run(&paths, &fake).notice, Some(Notice::Failed));

        fake.fail_uninstall.set(false);
        let fixed = run(&paths, &fake);
        assert_eq!((fixed.state, fixed.notice), (MoveState::Done, None));
        assert_eq!(state(&paths)["uninstalled"], true);
        assert_eq!(fake.uninstalls.borrow().len(), 1);
    }

    #[test]
    fn downloads_moved_after_uninstall_only() {
        let mut paths = plus_tree("after-uninstall");
        let fake = Fake { watch: Some(paths.old_roaming.join("downloads")), ..Fake::default() };
        paths.may_rename_downloads = true;
        run(&paths, &fake);
        assert_eq!(*fake.watched.borrow(), vec![true], "downloads were still in place at uninstall");
        assert!(!old_track(&paths) && new_track(&paths));
    }

    #[test]
    fn crash_after_uninstall_still_takes_downloads() {
        let mut paths = plus_tree("crash");
        // The uninstall finished, then the app died before the downloads moved.
        put(&paths.new_roaming.join(STATE), r#"{"state":"done","attempts":0,"uninstalled":true}"#);
        (paths.old_install_dir, paths.old_install_stamp, paths.old_install_exe) = (None, None, None);
        let fake = Fake::default();
        let out = run(&paths, &fake);
        assert_eq!((out.state, out.notice), (MoveState::Done, None));
        assert!(fake.uninstalls.borrow().is_empty());
        assert!(!old_track(&paths) && new_track(&paths));
        assert_eq!(state(&paths)["downloads"], "moved");
    }

    #[test]
    fn shortcuts_follow_the_recorded_desktop_shortcut() {
        let paths = plus_tree("shortcuts");
        let fake = Fake { old_desktop: true, ..Fake::default() };
        run(&paths, &fake);
        run(&paths, &fake);
        // Desktop once, from the run that saw YTubic's; Start on every launch.
        assert_eq!(*fake.shortcuts.borrow(), vec![true, false]);
        assert_eq!(state(&paths)["hadDesktop"], false);
    }

    #[test]
    fn key_stored_once_and_stripped_from_handoff() {
        let paths = plus_tree("key");
        let handoff = paths.old_roaming.join(HANDOFF);
        put(&handoff, r#"{"format":1,"frontend":{"localStorage":{}},"cookieKey":"a2V5"}"#);
        let fake = Fake::default();
        run(&paths, &fake);
        assert_eq!(*fake.keys.borrow(), vec!["a2V5".to_string()]);
        assert_eq!(state(&paths)["keyStored"], true);
        let left: Value = serde_json::from_str(&fs::read_to_string(&handoff).unwrap()).unwrap();
        assert!(left.get("cookieKey").is_none());
        assert_eq!(left["frontend"]["localStorage"], serde_json::json!({}));

        // A later retry must never overwrite a key Porchlight may have made since.
        put(&handoff, r#"{"format":1,"frontend":{},"cookieKey":"b3RoZXI="}"#);
        put(&paths.new_roaming.join(STATE), r#"{"state":"pending","attempts":1,"keyStored":true}"#);
        run(&paths, &fake);
        assert_eq!(fake.keys.borrow().len(), 1);
    }

    #[test]
    fn handoff_survives_until_acknowledged() {
        let paths = plus_tree("survives");
        assert_eq!(run(&paths, &Fake::default()).state, MoveState::Done);
        assert_eq!(handoff_frontend(&paths).unwrap()["localStorage"]["k"], "v");
        // A crash before the import: the next launch serves the same data.
        assert_eq!(run(&paths, &Fake::default()).state, MoveState::Done);
        assert!(paths.old_roaming.join(HANDOFF).exists());
        assert_eq!(handoff_frontend(&paths).unwrap()["localStorage"]["k"], "v");
    }

    #[test]
    fn ack_deletes_handoff_and_records_import() {
        let paths = plus_tree("ack");
        run(&paths, &Fake::default());
        ack_import(&paths).unwrap();
        assert!(!paths.old_roaming.join(HANDOFF).exists());
        let st = state(&paths);
        assert_eq!((st["state"].as_str(), st["frontendImported"].as_bool()), (Some("done"), Some(true)));
        assert!(handoff_frontend(&paths).is_none());
        let again = run(&paths, &Fake::default());
        assert_eq!((again.state, again.notice), (MoveState::Done, None));
    }

    #[test]
    fn mac_rename_skipped_when_parent_not_writable() {
        let old = Path::new("/Applications/YTubic.app");
        assert_eq!(mac_rename_target(old, false), None);
        assert_eq!(
            mac_rename_target(old, true),
            Some(PathBuf::from("/Applications/Porchlight.app"))
        );
        assert_eq!(mac_rename_target(Path::new("/Applications/Porchlight.app"), true), None);
    }

    #[cfg(windows)]
    #[test]
    fn install_dir_strips_quotes_and_falls_back() {
        let s = |v: &str| Some(v.to_string());
        assert_eq!(
            install_dir_from(s(r#""C:\Users\me\Desktop\YTubic""#), None),
            Some(PathBuf::from(r"C:\Users\me\Desktop\YTubic"))
        );
        assert_eq!(
            install_dir_from(s(""), s(r#""C:\Apps\YTubic\uninstall.exe""#)),
            Some(PathBuf::from(r"C:\Apps\YTubic"))
        );
        assert_eq!(install_dir_from(None, None), None);
    }
}
