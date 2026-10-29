//! 0.9.1 bridge: lets Porchlight recognise a YTubic Plus install and import its data.
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const MARKER: &str = "plus-marker.json";
const INSTALL_STAMP: &str = "plus-install.json";
const HANDOFF: &str = "porchlight-handoff.json";

fn stamp_json(version: &str) -> String {
    serde_json::json!({ "app": "ytubic-plus", "version": version }).to_string()
}

/// Where the install stamp goes: beside the exe, or in the bundle's Resources on macOS.
fn install_dir() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    if cfg!(target_os = "macos") {
        // <bundle>/Contents/MacOS/<exe> -> <bundle>/Contents/Resources
        return Some(exe_dir.parent()?.join("Resources"));
    }
    Some(exe_dir)
}

fn stamp_into(data_dir: &Path, install_dir: Option<&Path>, version: &str) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let body = stamp_json(version);
    fs::write(data_dir.join(MARKER), &body).map_err(|e| e.to_string())?;
    if let Some(dir) = install_dir {
        // A read-only install location (Program Files, a mounted dmg) is not fatal.
        if let Err(e) = fs::write(dir.join(INSTALL_STAMP), &body) {
            eprintln!("[bridge] install stamp not written: {e}");
        }
    }
    Ok(())
}

pub fn stamp(app: &AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    stamp_into(
        &data_dir,
        install_dir().as_deref(),
        &app.package_info().version.to_string(),
    )
}

fn write_handoff_into(
    dir: &Path,
    frontend: &str,
    cookie_key: Option<String>,
) -> Result<(), String> {
    let frontend: serde_json::Value = serde_json::from_str(frontend).map_err(|e| e.to_string())?;
    let body = serde_json::json!({ "format": 1, "frontend": frontend, "cookieKey": cookie_key })
        .to_string();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // Write beside then rename, so quitting mid-write never leaves half a handoff.
    let tmp = dir.join(format!("{HANDOFF}.tmp"));
    // A leftover file could keep looser permissions; the mode only applies on create.
    let _ = fs::remove_file(&tmp);
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    // Owner-only on unix. On Windows the per-user AppData ACL already restricts it.
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
    let mut file = opts.open(&tmp).map_err(|e| e.to_string())?;
    file.write_all(body.as_bytes()).map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&tmp, dir.join(HANDOFF)).map_err(|e| e.to_string())
}

/// Quit that gives the frontend a moment to save the handoff first. The
/// timer is the backstop so a dead or slow webview can never stall quitting.
pub fn request_quit(app: &AppHandle) {
    use tauri::Emitter;
    let _ = app.emit("quit-requested", ());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        app.exit(0);
    });
}

#[tauri::command]
pub async fn write_handoff(app: AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        write_handoff_into(&dir, &json, crate::secure_store::cookie_key_base64())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bridge-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn stamp_writes_marker_and_install_stamp() {
        let (data, install) = (scratch("stamp-data"), scratch("stamp-install"));
        stamp_into(&data, Some(&install), "0.9.1").unwrap();
        for p in [data.join(MARKER), install.join(INSTALL_STAMP)] {
            let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(p).unwrap()).unwrap();
            assert_eq!(v["app"], "ytubic-plus");
            assert_eq!(v["version"], "0.9.1");
        }
    }

    #[test]
    fn unwritable_install_dir_is_not_fatal() {
        let data = scratch("stamp-nodir");
        stamp_into(&data, Some(&data.join("missing")), "0.9.1").unwrap();
        assert!(data.join(MARKER).exists());
    }

    #[test]
    fn handoff_wraps_frontend_json() {
        let dir = scratch("handoff");
        write_handoff_into(&dir, r#"{"localStorage":{}}"#, Some("a2V5".into())).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(dir.join(HANDOFF)).unwrap()).unwrap();
        assert_eq!(v["format"], 1);
        assert_eq!(v["frontend"]["localStorage"], serde_json::json!({}));
        assert_eq!(v["cookieKey"], "a2V5");
        assert!(write_handoff_into(&dir, "not json", None).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn handoff_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("mode");
        write_handoff_into(&dir, "{}", None).unwrap();
        let mode = fs::metadata(dir.join(HANDOFF)).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
