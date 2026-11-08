// ListenBrainz scrobbling. Unlike Last.fm there's no signing and no browser
// sign-in: the user pastes their user token (listenbrainz.org/settings) and we
// send it as `Authorization: Token <token>`. Listens are JSON. A listen that
// can't be sent is kept in `listenbrainz-queue.json` and retried, the same way
// `lastfm.rs` keeps its queue.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

const API_ROOT: &str = "https://api.listenbrainz.org/1/";
const QUEUE_FILE: &str = "listenbrainz-queue.json";
// ListenBrainz takes up to 1000 listens per import; smaller keeps each request quick.
const BATCH: usize = 100;

#[derive(Default, Clone)]
pub struct ListenbrainzState {
    queue_lock: Arc<Mutex<()>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct PendingListen {
    artist: String,
    track: String,
    album: String,
    duration: Option<u32>,
    /// Unix seconds when the track started.
    timestamp: i64,
    token: String,
}

enum SendOutcome {
    Sent,
    Retry,
    Drop(String),
}

/// One listen's JSON. `listened_at` is left out for "playing_now".
fn listen_json(l: &PendingListen, with_time: bool) -> Value {
    let mut info = json!({
        "submission_client": "Porchlight",
        "submission_client_version": env!("CARGO_PKG_VERSION"),
        "media_player": "Porchlight",
        "music_service": "music.youtube.com",
    });
    if let Some(d) = l.duration {
        info["duration_ms"] = json!(d as u64 * 1000);
    }
    let mut meta = json!({
        "artist_name": l.artist,
        "track_name": l.track,
        "additional_info": info,
    });
    if !l.album.is_empty() {
        meta["release_name"] = json!(l.album);
    }
    let mut listen = json!({ "track_metadata": meta });
    if with_time {
        listen["listened_at"] = json!(l.timestamp);
    }
    listen
}

/// The submit-listens body: "playing_now", "single" for one listen, "import" for a batch.
fn submit_body(items: &[PendingListen], playing_now: bool) -> Value {
    let listen_type = if playing_now {
        "playing_now"
    } else if items.len() == 1 {
        "single"
    } else {
        "import"
    };
    json!({
        "listen_type": listen_type,
        "payload": items.iter().map(|l| listen_json(l, !playing_now)).collect::<Vec<_>>(),
    })
}

/// 2xx sent; 429 and 5xx are worth retrying; any other 4xx (bad token, bad
/// data) will never succeed, so it's dropped.
fn classify(status: u16) -> SendOutcome {
    match status {
        200..=299 => SendOutcome::Sent,
        429 | 500..=599 => SendOutcome::Retry,
        s => SendOutcome::Drop(format!("ListenBrainz HTTP {s}")),
    }
}

/// The account name from a validate-token reply, or None when the token is bad.
fn parse_validate(body: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Resp {
        #[serde(default)]
        valid: bool,
        user_name: Option<String>,
    }
    let r: Resp = serde_json::from_str(body).ok()?;
    if r.valid {
        r.user_name
    } else {
        None
    }
}

async fn submit(client: &reqwest::Client, token: &str, body: &Value) -> SendOutcome {
    let resp = client
        .post(format!("{API_ROOT}submit-listens"))
        .header("Authorization", format!("Token {token}"))
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await;
    match resp {
        Ok(r) => classify(r.status().as_u16()),
        Err(_) => SendOutcome::Retry, // offline / DNS / TLS
    }
}

fn queue_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config dir: {e}"))?;
    Ok(dir.join(QUEUE_FILE))
}

fn read_queue(app: &AppHandle) -> Vec<PendingListen> {
    let Ok(path) = queue_path(app) else {
        return Vec::new();
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_queue(app: &AppHandle, queue: &[PendingListen]) {
    let Ok(path) = queue_path(app) else {
        return;
    };
    if queue.is_empty() {
        let _ = std::fs::remove_file(&path);
        return;
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(s) = serde_json::to_string(queue) {
        let _ = std::fs::write(&path, s);
    }
}

async fn flush_queue(app: &AppHandle, client: &reqwest::Client, lock: &Mutex<()>) {
    let _guard = lock.lock().await;
    let queue = read_queue(app);
    if queue.is_empty() {
        return;
    }
    let mut groups: BTreeMap<String, Vec<PendingListen>> = BTreeMap::new();
    for l in queue {
        groups.entry(l.token.clone()).or_default().push(l);
    }
    let mut remaining = Vec::new();
    for (token, items) in groups {
        for chunk in items.chunks(BATCH) {
            match submit(client, &token, &submit_body(chunk, false)).await {
                SendOutcome::Sent => {}
                SendOutcome::Retry => remaining.extend_from_slice(chunk),
                SendOutcome::Drop(msg) => {
                    eprintln!("[listenbrainz] dropping {} listen(s): {msg}", chunk.len())
                }
            }
        }
    }
    write_queue(app, &remaining);
}

/// Check a pasted user token. Ok(Some(name)) when valid, Ok(None) when
/// ListenBrainz says it isn't, Err on a network problem.
#[tauri::command]
pub async fn listenbrainz_validate(token: String) -> Result<Option<String>, String> {
    let body = reqwest::Client::new()
        .get(format!("{API_ROOT}validate-token"))
        .header("Authorization", format!("Token {}", token.trim()))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?
        .text()
        .await
        .map_err(|e| format!("read error: {e}"))?;
    Ok(parse_validate(&body))
}

/// Fire-and-forget, like Last.fm's now playing.
#[tauri::command]
pub async fn listenbrainz_now_playing(
    artist: String,
    track: String,
    album: String,
    duration: Option<u32>,
    token: String,
) -> Result<(), String> {
    if artist.is_empty() || track.is_empty() {
        return Ok(());
    }
    let l = PendingListen { artist, track, album, duration, timestamp: 0, token };
    let _ = submit(&reqwest::Client::new(), &l.token, &submit_body(std::slice::from_ref(&l), true)).await;
    Ok(())
}

#[tauri::command]
pub async fn listenbrainz_scrobble(
    app: AppHandle,
    state: State<'_, ListenbrainzState>,
    artist: String,
    track: String,
    album: String,
    duration: Option<u32>,
    timestamp: i64,
    token: String,
) -> Result<(), String> {
    if artist.is_empty() || track.is_empty() {
        return Ok(());
    }
    let client = reqwest::Client::new();
    let l = PendingListen { artist, track, album, duration, timestamp, token };
    match submit(&client, &l.token, &submit_body(std::slice::from_ref(&l), false)).await {
        SendOutcome::Sent => flush_queue(&app, &client, &state.queue_lock).await,
        SendOutcome::Retry => {
            let _guard = state.queue_lock.lock().await;
            let mut queue = read_queue(&app);
            queue.push(l);
            write_queue(&app, &queue);
        }
        SendOutcome::Drop(msg) => eprintln!("[listenbrainz] listen rejected, dropping: {msg}"),
    }
    Ok(())
}

#[tauri::command]
pub async fn listenbrainz_flush(
    app: AppHandle,
    state: State<'_, ListenbrainzState>,
) -> Result<(), String> {
    flush_queue(&app, &reqwest::Client::new(), &state.queue_lock).await;
    Ok(())
}

/// Disconnect: forget listens still waiting for this token.
#[tauri::command]
pub async fn listenbrainz_forget(
    app: AppHandle,
    state: State<'_, ListenbrainzState>,
    token: String,
) -> Result<(), String> {
    let _guard = state.queue_lock.lock().await;
    let queue: Vec<_> = read_queue(&app).into_iter().filter(|l| l.token != token).collect();
    write_queue(&app, &queue);
    Ok(())
}

pub fn flush_on_startup(app: AppHandle) {
    let lock = app.state::<ListenbrainzState>().queue_lock.clone();
    tauri::async_runtime::spawn(async move {
        flush_queue(&app, &reqwest::Client::new(), &lock).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn listen(track: &str, album: &str, duration: Option<u32>) -> PendingListen {
        PendingListen {
            artist: "Artist".into(),
            track: track.into(),
            album: album.into(),
            duration,
            timestamp: 1_700_000_000,
            token: "tok".into(),
        }
    }

    #[test]
    fn one_listen_is_single_with_its_start_time() {
        let b = submit_body(&[listen("Song", "Album", Some(200))], false);
        assert_eq!(b["listen_type"], "single");
        let l = &b["payload"][0];
        assert_eq!(l["listened_at"], 1_700_000_000);
        assert_eq!(l["track_metadata"]["artist_name"], "Artist");
        assert_eq!(l["track_metadata"]["track_name"], "Song");
        assert_eq!(l["track_metadata"]["release_name"], "Album");
        assert_eq!(l["track_metadata"]["additional_info"]["duration_ms"], 200_000);
        assert_eq!(l["track_metadata"]["additional_info"]["submission_client"], "Porchlight");
    }

    #[test]
    fn playing_now_has_no_time_and_blank_fields_are_left_out() {
        let b = submit_body(&[listen("Song", "", None)], true);
        assert_eq!(b["listen_type"], "playing_now");
        let l = &b["payload"][0];
        assert!(l.get("listened_at").is_none());
        assert!(l["track_metadata"].get("release_name").is_none());
        assert!(l["track_metadata"]["additional_info"].get("duration_ms").is_none());
    }

    #[test]
    fn a_backlog_goes_as_one_import() {
        let b = submit_body(&[listen("A", "", None), listen("B", "", None)], false);
        assert_eq!(b["listen_type"], "import");
        assert_eq!(b["payload"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn only_rate_limits_and_server_errors_are_retried() {
        assert!(matches!(classify(200), SendOutcome::Sent));
        assert!(matches!(classify(429), SendOutcome::Retry));
        assert!(matches!(classify(503), SendOutcome::Retry));
        assert!(matches!(classify(401), SendOutcome::Drop(_)));
        assert!(matches!(classify(400), SendOutcome::Drop(_)));
    }

    #[test]
    fn validate_reads_the_name_only_when_valid() {
        let ok = r#"{"code":200,"message":"Token valid.","valid":true,"user_name":"listener"}"#;
        assert_eq!(parse_validate(ok).as_deref(), Some("listener"));
        let bad = r#"{"code":200,"message":"Token invalid.","valid":false}"#;
        assert_eq!(parse_validate(bad), None);
        assert_eq!(parse_validate("<html>"), None);
    }
}
