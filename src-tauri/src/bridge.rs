//! Quit that gives the frontend a moment to save playback first.
use tauri::AppHandle;

/// The timer is the backstop so a dead or slow webview can never stall quitting.
pub fn request_quit(app: &AppHandle) {
    use tauri::Emitter;
    let _ = app.emit("quit-requested", ());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        app.exit(0);
    });
}
