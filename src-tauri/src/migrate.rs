//! Porchlight first launch: moves a YTubic Plus user's data over from the old
//! app ID's folders and removes the old Plus install. NUber's YTubic shares
//! those folders and the old install slot, so nothing happens without the Plus
//! marker, and the install is removed only when it carries the Plus stamp too.
//! Temporary, like bridge.rs.
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

pub const OLD_IDENTIFIER: &str = "com.github.ivasy.ytubic";
const MARKER: &str = "plus-marker.json";
const INSTALL_STAMP: &str = "plus-install.json";
const HANDOFF: &str = "porchlight-handoff.json";
const STATE: &str = "moved-from-plus.json";
const FAILED_AFTER: u32 = 3;

/// Top-level names in the old data folder that never come over. Downloads are
/// handled on their own, since they may move instead of copy.
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
    pub old_install_stamp: Option<PathBuf>,
    pub old_install_dir: Option<PathBuf>,
}

impl MovePaths {
    pub fn detect(app: &AppHandle) -> Result<MovePaths, String> {
        let old_of = |new: &Path| new.with_file_name(OLD_IDENTIFIER);
        let new_roaming = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let new_config = app.path().app_config_dir().map_err(|e| e.to_string())?;
        let (old_install_dir, old_install_stamp) = old_install();
        #[allow(unused_mut)]
        let mut paths = MovePaths {
            old_roaming: old_of(&new_roaming),
            old_config: old_of(&new_config),
            new_roaming,
            new_config,
            old_install_stamp,
            old_install_dir,
        };
        // Dev runs share the release identifier: copy only, so a dev build never
        // moves the real downloads or uninstalls the real app.
        #[cfg(debug_assertions)]
        {
            paths.old_install_stamp = None;
            if paths.old_install_dir.is_none() {
                paths.old_install_dir = Some(paths.old_roaming.clone());
            }
        }
        Ok(paths)
    }
}

/// The old install slot and its Plus stamp, when present.
#[cfg(windows)]
fn old_install() -> (Option<PathBuf>, Option<PathBuf>) {
    let dir = install_dir_from(win::reg_string("InstallLocation"), win::reg_string("UninstallString"));
    let stamp = dir.as_ref().map(|d| d.join(INSTALL_STAMP)).filter(|p| p.exists());
    (dir, stamp)
}

#[cfg(target_os = "macos")]
fn old_install() -> (Option<PathBuf>, Option<PathBuf>) {
    // The updater replaces the running bundle in place, so only a second
    // YTubic.app elsewhere is an old install.
    let running = mac::running_bundle().and_then(|b| b.canonicalize().ok());
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let dir = [PathBuf::from("/Applications/YTubic.app"), home.join("Applications/YTubic.app")]
        .into_iter()
        .find(|p| p.exists() && p.canonicalize().ok() != running);
    let stamp = dir
        .as_ref()
        .map(|d| d.join("Contents/Resources").join(INSTALL_STAMP))
        .filter(|p| p.exists());
    (dir, stamp)
}

/// deb/rpm are swapped by the package's Replaces, and an AppImage updates in
/// place, so there is never an old Plus install to remove. A YTubic binary on
/// the system is NUber's package, which still reads the old downloads.
#[cfg(not(any(windows, target_os = "macos")))]
fn old_install() -> (Option<PathBuf>, Option<PathBuf>) {
    let dir = Path::new("/usr/bin");
    (dir.join("ytubic").exists().then(|| dir.to_path_buf()), None)
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

// The app calls move_data, which also hands back the frontend data.
#[cfg_attr(not(test), allow(dead_code))]
pub fn run(paths: &MovePaths, uninstall: &dyn Fn(&Path) -> Result<(), String>) -> MoveOutcome {
    move_data(paths, uninstall).0
}

fn outcome(state: MoveState, attempts: u32, notice: Option<Notice>) -> MoveOutcome {
    MoveOutcome { state, attempts, notice }
}

/// `run`, plus the handoff's `frontend` object when this call completed the move.
fn move_data(
    paths: &MovePaths,
    uninstall: &dyn Fn(&Path) -> Result<(), String>,
) -> (MoveOutcome, Option<Value>) {
    if !is_plus_stamp(&paths.old_roaming.join(MARKER)) {
        return (outcome(MoveState::NotPlus, 0, None), None);
    }
    let (done, attempts) = read_state(&paths.new_roaming);
    if done {
        return (outcome(MoveState::Done, attempts, None), None);
    }
    match attempt(paths, uninstall, attempts) {
        Ok(frontend) => (outcome(MoveState::Done, attempts, Some(Notice::Moved)), frontend),
        Err(e) => {
            eprintln!("[migrate] move from YTubic Plus failed: {e}");
            let attempts = attempts + 1;
            if let Err(e) = write_state(&paths.new_roaming, false, attempts) {
                eprintln!("[migrate] state not saved: {e}");
            }
            let notice = (attempts >= FAILED_AFTER).then_some(Notice::Failed);
            (outcome(MoveState::Pending, attempts, notice), None)
        }
    }
}

fn attempt(
    paths: &MovePaths,
    uninstall: &dyn Fn(&Path) -> Result<(), String>,
    attempts: u32,
) -> Result<Option<Value>, String> {
    write_state(&paths.new_roaming, false, attempts)?;
    let mut copied = Vec::new();
    copy_tree(&paths.old_roaming, &paths.new_roaming, true, &mut copied)?;
    if paths.old_config != paths.old_roaming {
        copy_tree(&paths.old_config, &paths.new_config, true, &mut copied)?;
    }
    let plus_install = paths.old_install_stamp.as_deref().is_some_and(is_plus_stamp);
    // An install without the Plus stamp is NUber's YTubic, which still reads these.
    let may_move = paths.old_install_dir.is_none() || plus_install;
    take_downloads(
        &paths.old_roaming.join("downloads"),
        &paths.new_roaming.join("downloads"),
        may_move,
        &mut copied,
    )?;
    for (path, len) in &copied {
        if fs::metadata(path).map(|m| m.len()).ok() != Some(*len) {
            return Err(format!("{} did not copy intact", path.display()));
        }
    }
    let mut handoff = read_handoff(&paths.old_roaming)?;
    if let Some(key) = handoff.as_ref().and_then(|h| h["cookieKey"].as_str()) {
        crate::secure_store::store_cookie_key_base64(key)?;
    }
    if plus_install {
        if let Some(dir) = &paths.old_install_dir {
            uninstall(dir)?;
        }
    }
    write_state(&paths.new_roaming, true, attempts)?;
    // The handoff may carry the login key; it must not outlive the move.
    if let Err(e) = fs::remove_file(paths.old_roaming.join(HANDOFF)) {
        if e.kind() != std::io::ErrorKind::NotFound {
            eprintln!("[migrate] handoff not deleted: {e}");
        }
    }
    Ok(handoff.as_mut().and_then(|h| h.get_mut("frontend")).map(Value::take))
}

fn is_plus_stamp(path: &Path) -> bool {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .is_some_and(|v| v["app"] == "ytubic-plus")
}

/// (done, attempts). A missing or unreadable state is a first attempt.
fn read_state(dir: &Path) -> (bool, u32) {
    let v: Value = fs::read(dir.join(STATE))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    (v["state"] == "done", v["attempts"].as_u64().unwrap_or(0) as u32)
}

fn write_state(dir: &Path, done: bool, attempts: u32) -> Result<(), String> {
    let state = if done { "done" } else { "pending" };
    let body = serde_json::json!({ "state": state, "attempts": attempts }).to_string();
    fs::create_dir_all(dir)
        .and_then(|_| fs::write(dir.join(STATE), body))
        .map_err(|e| format!("{}: {e}", dir.join(STATE).display()))
}

/// Absent is fine; present must parse, or the move stays pending.
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
            fs::copy(&from, &to).map_err(|e| at(&to, e))?;
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

/// Renames the folder across when allowed (instant on one volume), else copies.
fn take_downloads(
    src: &Path,
    dst: &Path,
    may_move: bool,
    copied: &mut Vec<(PathBuf, u64)>,
) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }
    if may_move {
        // downloads::init leaves empty folders behind on a launch where the move failed.
        if holds_no_files(dst) {
            let _ = fs::remove_dir_all(dst);
        }
        if !dst.exists() && fs::rename(src, dst).is_ok() {
            return Ok(());
        }
    }
    copy_tree(src, dst, false, copied)
}

/// True for an existing folder tree with no files in it.
fn holds_no_files(dir: &Path) -> bool {
    fs::read_dir(dir).is_ok_and(|entries| {
        entries.into_iter().all(|e| {
            e.is_ok_and(|e| e.file_type().is_ok_and(|t| t.is_dir()) && holds_no_files(&e.path()))
        })
    })
}

/// The real uninstall: Windows runs the old NSIS uninstaller, macOS removes the
/// old bundle, Linux has nothing to remove (see `old_install`).
#[cfg(windows)]
fn uninstall_old(dir: &Path, identifier: &str) -> Result<(), String> {
    win::uninstall(dir, identifier)
}

#[cfg(target_os = "macos")]
fn uninstall_old(dir: &Path, _identifier: &str) -> Result<(), String> {
    let running = mac::running_bundle().and_then(|b| b.canonicalize().ok());
    if dir.canonicalize().ok() == running {
        return Ok(());
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

#[cfg(not(any(windows, target_os = "macos")))]
fn uninstall_old(_dir: &Path, _identifier: &str) -> Result<(), String> {
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
    use windows::Win32::System::Registry::{
        RegCloseKey, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ, RRF_RT_REG_SZ,
    };

    const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\YTubic";

    pub fn reg_string(name: &str) -> Option<String> {
        let (key, name) = (HSTRING::from(UNINSTALL_KEY), HSTRING::from(name));
        let mut len = 0u32;
        unsafe {
            RegGetValueW(HKEY_CURRENT_USER, &key, &name, RRF_RT_REG_SZ, None, None, Some(&mut len))
                .ok()
                .ok()?;
            let mut buf = vec![0u16; len as usize / 2 + 1];
            RegGetValueW(
                HKEY_CURRENT_USER,
                &key,
                &name,
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut len),
            )
            .ok()
            .ok()?;
            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            Some(String::from_utf16_lossy(&buf[..end]))
        }
    }

    fn key_exists() -> bool {
        let mut key = HKEY::default();
        unsafe {
            let open = RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(UNINSTALL_KEY), None, KEY_READ, &mut key);
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

    pub fn uninstall(dir: &Path, aumid: &str) -> Result<(), String> {
        use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_Programs};
        let desktop = known_folder(&FOLDERID_Desktop);
        let had_desktop = desktop.as_ref().is_some_and(|d| d.join("YTubic.lnk").exists());
        let status = std::process::Command::new(dir.join("uninstall.exe"))
            .arg("/S")
            .status()
            .map_err(|e| format!("old uninstaller: {e}"))?;
        if !status.success() {
            return Err(format!("old uninstaller exited with {status}"));
        }
        // NSIS relaunches itself from %TEMP%, so the first process exits before it's done.
        let deadline = Instant::now() + Duration::from_secs(30);
        while key_exists() {
            if Instant::now() > deadline {
                return Err("old uninstaller did not finish".into());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        // The updater's /UPDATE install makes no shortcuts, and the uninstaller
        // just removed YTubic's, so without these the app has no Start entry
        // and the media tile has no shortcut to resolve its AUMID against.
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut folders = vec![known_folder(&FOLDERID_Programs)];
        if had_desktop {
            folders.push(desktop);
        }
        for folder in folders.into_iter().flatten() {
            let lnk = folder.join("Porchlight.lnk");
            if let Err(e) = create_shortcut(&lnk, &exe, aumid) {
                eprintln!("[migrate] shortcut {} not created: {e}", lnk.display());
            }
        }
        Ok(())
    }

    fn create_shortcut(lnk: &Path, target: &Path, aumid: &str) -> windows::core::Result<()> {
        use std::mem::ManuallyDrop;
        use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
        use windows::Win32::System::Com::StructuredStorage::{
            PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
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
                // The shell wants VT_LPWSTR here; PROPVARIANT's Drop frees the string.
                let id = PROPVARIANT {
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
                store.SetValue(&PKEY_AppUserModel_ID, &id)?;
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

/// Shared with the commands: what this launch's move did, and the handoff's
/// frontend data for the import, handed out once.
pub struct MoveCell {
    outcome: Mutex<MoveOutcome>,
    frontend: Mutex<Option<Value>>,
}

static MOVING: Mutex<()> = Mutex::new(());

fn move_now(app: &AppHandle) -> (MoveOutcome, Option<Value>) {
    let _one_at_a_time = MOVING.lock().unwrap_or_else(|e| e.into_inner());
    let identifier = app.config().identifier.clone();
    match MovePaths::detect(app) {
        Ok(paths) => move_data(&paths, &|dir| uninstall_old(dir, &identifier)),
        Err(e) => {
            eprintln!("[migrate] paths unavailable: {e}");
            (outcome(MoveState::NotPlus, 0, None), None)
        }
    }
}

/// Runs in setup, before anything reads the data folder; the frontend's calls
/// queue behind setup, so the result is ready when it asks.
pub fn start(app: &AppHandle) {
    let (outcome, frontend) = move_now(app);
    eprintln!("[migrate] {outcome:?}");
    // Not on the launch that moved: relaunching then would drop the
    // in-memory handoff before the frontend imports it.
    #[cfg(target_os = "macos")]
    if outcome.state == MoveState::Done && outcome.notice.is_none() {
        mac::rename_and_relaunch();
    }
    app.manage(MoveCell { outcome: Mutex::new(outcome), frontend: Mutex::new(frontend) });
}

#[tauri::command]
pub fn take_handoff_frontend(cell: State<'_, MoveCell>) -> Option<Value> {
    cell.frontend.lock().unwrap_or_else(|e| e.into_inner()).take()
}

#[tauri::command]
pub fn move_status(cell: State<'_, MoveCell>) -> MoveOutcome {
    cell.outcome.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub async fn retry_move(app: AppHandle) -> Result<MoveOutcome, String> {
    let handle = app.clone();
    let (outcome, frontend) = tauri::async_runtime::spawn_blocking(move || move_now(&handle))
        .await
        .map_err(|e| e.to_string())?;
    let cell = app.state::<MoveCell>();
    *cell.outcome.lock().unwrap_or_else(|e| e.into_inner()) = outcome.clone();
    if frontend.is_some() {
        *cell.frontend.lock().unwrap_or_else(|e| e.into_inner()) = frontend;
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::fs;

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

    /// A Plus user's old folders and install, with both stamps.
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
        put(&install.join(INSTALL_STAMP), STAMP);
        MovePaths {
            old_config: old.clone(),
            new_config: new.clone(),
            old_roaming: old,
            new_roaming: new,
            old_install_stamp: Some(install.join(INSTALL_STAMP)),
            old_install_dir: Some(install),
        }
    }

    fn state(paths: &MovePaths) -> Value {
        serde_json::from_str(&fs::read_to_string(paths.new_roaming.join(STATE)).unwrap()).unwrap()
    }

    #[test]
    fn not_plus_without_marker() {
        let paths = plus_tree("not-plus");
        fs::remove_file(paths.old_roaming.join(MARKER)).unwrap();
        let calls = RefCell::new(0);
        let out = run(&paths, &|_| {
            *calls.borrow_mut() += 1;
            Ok(())
        });
        assert_eq!(out.state, MoveState::NotPlus);
        assert_eq!(out.notice, None);
        assert!(!paths.new_roaming.exists());
        assert!(paths.old_roaming.join(HANDOFF).exists());
        assert_eq!(*calls.borrow(), 0);
    }

    #[test]
    fn copies_and_uninstalls_with_both_stamps() {
        let paths = plus_tree("both-stamps");
        let calls = RefCell::new(Vec::new());
        let uninstall = |dir: &Path| {
            calls.borrow_mut().push(dir.to_path_buf());
            Ok(())
        };
        let (out, frontend) = move_data(&paths, &uninstall);
        assert_eq!(out.state, MoveState::Done);
        assert_eq!(out.notice, Some(Notice::Moved));
        assert_eq!(*calls.borrow(), vec![paths.old_install_dir.clone().unwrap()]);
        assert_eq!(state(&paths)["state"], "done");
        let (old, new) = (&paths.old_roaming, &paths.new_roaming);
        for f in ["accounts.json", "accounts/acct-1/cookies.enc", "bin/yt-dlp.exe", "settings.json"] {
            assert_eq!(fs::read(old.join(f)).unwrap(), fs::read(new.join(f)).unwrap(), "{f}");
        }
        // Plus owns the old slot, so downloads move instead of doubling.
        assert_eq!(fs::read_to_string(new.join("downloads/tracks/a.m4a")).unwrap(), "audio");
        assert!(!old.join("downloads").exists());
        assert!(!new.join(MARKER).exists() && !new.join(HANDOFF).exists());
        assert!(!old.join(HANDOFF).exists(), "handoff is deleted after a verified move");
        assert!(old.join(MARKER).exists(), "the old folder is otherwise left alone");
        assert_eq!(frontend.unwrap()["localStorage"]["k"], "v");

        let again = run(&paths, &uninstall);
        assert_eq!(again.state, MoveState::Done);
        assert_eq!(again.notice, None);
        assert_eq!(calls.borrow().len(), 1);
    }

    #[test]
    fn copies_but_never_uninstalls_without_install_stamp() {
        let mut paths = plus_tree("no-stamp");
        // NUber's YTubic was installed over Plus: the slot exists, the stamp is gone.
        fs::remove_file(paths.old_install_stamp.take().unwrap()).unwrap();
        let calls = RefCell::new(0);
        let out = run(&paths, &|_| {
            *calls.borrow_mut() += 1;
            Ok(())
        });
        assert_eq!(out.state, MoveState::Done);
        assert_eq!(*calls.borrow(), 0);
        assert!(paths.new_roaming.join("accounts.json").exists());
        // NUber's app still reads these, so they are copied, never moved.
        assert!(paths.old_roaming.join("downloads/tracks/a.m4a").exists());
        assert!(paths.new_roaming.join("downloads/tracks/a.m4a").exists());
    }

    #[test]
    fn verifies_without_accounts() {
        let paths = plus_tree("no-accounts");
        fs::remove_file(paths.old_roaming.join("accounts.json")).unwrap();
        fs::remove_dir_all(paths.old_roaming.join("accounts")).unwrap();
        let out = run(&paths, &|_| Ok(()));
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
        let calls = RefCell::new(0);
        let uninstall = |_: &Path| {
            *calls.borrow_mut() += 1;
            Ok(())
        };
        let out = run(&paths, &uninstall);
        assert_eq!(out.state, MoveState::Done);
        assert_eq!(out.attempts, 1);
        assert_eq!(out.notice, Some(Notice::Moved));
        assert!(new.join("accounts/acct-1/cookies.enc").exists());
        assert_eq!(
            fs::read_to_string(new.join("settings.json")).unwrap(),
            r#"{"changed":"in porchlight"}"#,
            "a newer file Porchlight wrote is kept"
        );
        assert!(new.join("downloads/tracks/a.m4a").exists());
        assert!(!paths.old_roaming.join("downloads").exists());
        assert_eq!(run(&paths, &uninstall).state, MoveState::Done);
        assert_eq!(*calls.borrow(), 1);
    }

    #[test]
    fn copy_error_keeps_old_install() {
        let paths = plus_tree("copy-error");
        // A folder where a file has to go: that copy cannot succeed.
        fs::create_dir_all(paths.new_roaming.join("accounts.json")).unwrap();
        let calls = RefCell::new(0);
        let out = run(&paths, &|_| {
            *calls.borrow_mut() += 1;
            Ok(())
        });
        assert_eq!(out.state, MoveState::Pending);
        assert_eq!(out.attempts, 1);
        assert_eq!(out.notice, None);
        assert_eq!(*calls.borrow(), 0);
        assert_eq!(state(&paths)["state"], "pending");
        let old = &paths.old_roaming;
        for f in ["accounts.json", "downloads/tracks/a.m4a", HANDOFF, MARKER] {
            assert!(old.join(f).exists(), "{f}");
        }
    }

    #[test]
    fn corrupt_handoff_does_not_block_files() {
        let paths = plus_tree("corrupt");
        put(&paths.old_roaming.join(HANDOFF), "not json");
        let calls = RefCell::new(0);
        let uninstall = |_: &Path| {
            *calls.borrow_mut() += 1;
            Ok(())
        };
        let (out, frontend) = move_data(&paths, &uninstall);
        assert_eq!(out.state, MoveState::Pending);
        assert_eq!(out.attempts, 1);
        assert!(frontend.is_none());
        assert!(paths.new_roaming.join("accounts/acct-1/cookies.enc").exists());
        assert_eq!(*calls.borrow(), 0);

        fs::remove_file(paths.old_roaming.join(HANDOFF)).unwrap();
        let (out, frontend) = move_data(&paths, &uninstall);
        assert_eq!(out.state, MoveState::Done);
        assert_eq!(out.notice, Some(Notice::Moved));
        assert!(frontend.is_none());
        assert_eq!(*calls.borrow(), 1);
    }

    #[test]
    fn failed_notice_after_three_attempts() {
        let paths = plus_tree("three");
        put(&paths.old_roaming.join(HANDOFF), "not json");
        let notices: Vec<_> = (0..3).map(|_| run(&paths, &|_| Ok(())).notice).collect();
        assert_eq!(notices, vec![None, None, Some(Notice::Failed)]);
        assert_eq!(state(&paths)["attempts"], 3);
    }

    #[test]
    fn failed_uninstall_stays_pending() {
        let paths = plus_tree("uninstall-fails");
        let out = run(&paths, &|_| Err("uninstaller missing".into()));
        assert_eq!(out.state, MoveState::Pending);
        assert!(paths.old_roaming.join(HANDOFF).exists());
        assert_eq!(run(&paths, &|_| Ok(())).state, MoveState::Done);
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
