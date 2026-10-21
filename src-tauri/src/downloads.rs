//! Offline downloads: an index of downloaded collections and tracks, the
//! background yt-dlp queue that fills it, and the files under
//! `app_data_dir()/downloads/`.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;
use tokio::process::Command as TokioCommand;
use tokio::sync::{Mutex, Notify};

use crate::{fetch_cover_bytes, sanitize_video_id, url_to_filename, ytdlp, YTDLP_AUDIO_ARGS};

/// Ref key for a track downloaded on its own (track menu → Download).
pub const SINGLE: &str = "single";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackState {
    #[default]
    Pending,
    Done,
    Failed,
}

// `default` on every persisted struct: index files written by older
// versions must keep loading as fields are added.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DlTrack {
    pub video_id: String,
    /// The frontend's QueueTrack, stored opaquely so offline views can
    /// render and queue the track without any network.
    pub meta: serde_json::Value,
    pub cover_url: Option<String>,
    pub cover_file: Option<String>,
    pub state: TrackState,
    pub error: Option<String>,
    pub attempts: u8,
    /// Unix secs before which a failed attempt isn't retried (backoff).
    pub next_try: u64,
    pub size: u64,
    /// Collection ids (and/or `SINGLE`) that need this file.
    pub refs: BTreeSet<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DlCollection {
    pub id: String,
    /// "playlist" | "album" | "liked"
    pub kind: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub cover_url: Option<String>,
    pub cover_file: Option<String>,
    pub track_ids: Vec<String>,
    pub synced_at: u64,
    /// Account the list belongs to (Liked Songs), so another signed-in
    /// account's sync can't replace it.
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Index {
    pub version: u32,
    pub collections: BTreeMap<String, DlCollection>,
    pub tracks: BTreeMap<String, DlTrack>,
}

impl Default for Index {
    fn default() -> Self {
        Self {
            version: 1,
            collections: BTreeMap::new(),
            tracks: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInput {
    pub video_id: String,
    pub meta: serde_json::Value,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInput {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub cover_url: Option<String>,
    #[serde(default)]
    pub owner: Option<String>,
    pub tracks: Vec<TrackInput>,
}

impl Index {
    /// Add a ref to a track, creating it as Pending if new. A failed track
    /// gets a fresh set of attempts (sync is the retry trigger).
    fn add_ref(&mut self, t: TrackInput, key: &str) {
        let e = self.tracks.entry(t.video_id.clone()).or_insert_with(|| DlTrack {
            video_id: t.video_id.clone(),
            meta: serde_json::Value::Null,
            cover_url: None,
            cover_file: None,
            state: TrackState::Pending,
            error: None,
            attempts: 0,
            next_try: 0,
            size: 0,
            refs: BTreeSet::new(),
        });
        e.meta = t.meta;
        if t.cover_url.is_some() {
            e.cover_url = t.cover_url;
        }
        if e.state == TrackState::Failed {
            e.state = TrackState::Pending;
            e.attempts = 0;
            e.next_try = 0;
            e.error = None;
        }
        e.refs.insert(key.to_string());
    }

    /// Drop a ref; returns the id if that was the last one (file to delete).
    fn drop_ref(&mut self, video_id: &str, key: &str) -> Option<String> {
        let t = self.tracks.get_mut(video_id)?;
        t.refs.remove(key);
        if t.refs.is_empty() {
            self.tracks.remove(video_id);
            Some(video_id.to_string())
        } else {
            None
        }
    }

    /// Insert or re-sync a collection. Returns ids whose files are no
    /// longer needed. Validates every id before mutating anything.
    pub fn apply_collection(&mut self, c: CollectionInput, now: u64) -> Result<Vec<String>, String> {
        if let Some(bad) = c.tracks.iter().find(|t| !sanitize_video_id(&t.video_id)) {
            return Err(format!("invalid videoId: {}", bad.video_id));
        }
        let old: Vec<String> = self
            .collections
            .get(&c.id)
            .map(|x| x.track_ids.clone())
            .unwrap_or_default();
        let mut track_ids = Vec::with_capacity(c.tracks.len());
        for t in c.tracks {
            if !track_ids.contains(&t.video_id) {
                track_ids.push(t.video_id.clone());
            }
            self.add_ref(t, &c.id);
        }
        let mut removed = Vec::new();
        for id in old.iter().filter(|id| !track_ids.contains(id)) {
            removed.extend(self.drop_ref(id, &c.id));
        }
        let prev = self.collections.remove(&c.id);
        self.collections.insert(
            c.id.clone(),
            DlCollection {
                cover_file: prev
                    .filter(|p| p.cover_url == c.cover_url)
                    .and_then(|p| p.cover_file),
                id: c.id,
                kind: c.kind,
                title: c.title,
                subtitle: c.subtitle,
                cover_url: c.cover_url,
                track_ids,
                synced_at: now,
                owner: c.owner,
            },
        );
        Ok(removed)
    }

    pub fn remove_collection(&mut self, id: &str) -> Vec<String> {
        let Some(c) = self.collections.remove(id) else {
            return Vec::new();
        };
        c.track_ids
            .iter()
            .filter_map(|t| self.drop_ref(t, id))
            .collect()
    }

    pub fn add_single(&mut self, t: TrackInput) -> Result<(), String> {
        if !sanitize_video_id(&t.video_id) {
            return Err(format!("invalid videoId: {}", t.video_id));
        }
        self.add_ref(t, SINGLE);
        Ok(())
    }

    /// Next pending track that isn't being fetched and whose backoff is over.
    pub fn next_pending(&self, now: u64, busy: &BTreeSet<String>) -> Option<String> {
        self.tracks
            .values()
            .find(|t| {
                t.state == TrackState::Pending && t.next_try <= now && !busy.contains(&t.video_id)
            })
            .map(|t| t.video_id.clone())
    }

    /// Requeue every failed track (back online). Returns whether any changed.
    pub fn retry_failed(&mut self) -> bool {
        let mut changed = false;
        for t in self.tracks.values_mut().filter(|t| t.state == TrackState::Failed) {
            t.state = TrackState::Pending;
            t.attempts = 0;
            t.next_try = 0;
            t.error = None;
            changed = true;
        }
        changed
    }

    pub fn remove_single(&mut self, video_id: &str) -> Vec<String> {
        self.drop_ref(video_id, SINGLE).into_iter().collect()
    }
}

/// Missing file → empty index. Corrupt file → set aside as `.bad` (never
/// silently overwritten) and start empty.
pub fn load_index(path: &Path) -> Index {
    let Ok(bytes) = std::fs::read(path) else {
        return Index::default();
    };
    match serde_json::from_slice(&bytes) {
        Ok(idx) => idx,
        Err(e) => {
            eprintln!("[downloads] corrupt index ({e}); moving aside");
            let _ = std::fs::rename(path, path.with_extension("json.bad"));
            Index::default()
        }
    }
}

/// Atomic write: a crash mid-save never leaves a truncated index.
pub fn save_index(path: &Path, idx: &Index) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(idx)?)?;
    std::fs::rename(&tmp, path)
}

// ---------------------------------------------------------------------------
// Files, recovery, worker
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS: u8 = 3;
const WORKERS: usize = 2;
/// Same floor as the stream cache: yt-dlp can exit 0 with a stub payload.
const MIN_AUDIO_BYTES: u64 = 32 * 1024;

fn tracks_dir(dir: &Path) -> PathBuf {
    dir.join("tracks")
}

fn covers_dir(dir: &Path) -> PathBuf {
    dir.join("covers")
}

fn track_file(dir: &Path, video_id: &str) -> PathBuf {
    tracks_dir(dir).join(format!("{video_id}.webm"))
}

/// Not `.part`: yt-dlp strips that suffix from `-o` and writes `<id>`.
fn temp_track_file(dir: &Path, video_id: &str) -> PathBuf {
    track_file(dir, video_id).with_extension("tmp")
}

/// The downloaded file for `video_id`, if there is one. Used by the stream
/// server to serve downloads before the cache or yt-dlp.
pub(crate) fn downloaded_track_path(dir: &Path, video_id: &str) -> Option<PathBuf> {
    if !sanitize_video_id(video_id) {
        return None;
    }
    let p = track_file(dir, video_id);
    p.is_file().then_some(p)
}

/// Startup repair after a crash or a deleted file: drop anything in
/// `tracks/` the index doesn't list as a `.webm` (temp files, stray yt-dlp
/// output, orphans) and requeue any "done" track whose file is gone.
fn recover(dir: &Path, idx: &mut Index) {
    if let Ok(rd) = std::fs::read_dir(tracks_dir(dir)) {
        for e in rd.flatten() {
            let p = e.path();
            let listed = p.extension().is_some_and(|x| x == "webm")
                && p.file_stem()
                    .and_then(|s| s.to_str())
                    .is_some_and(|id| idx.tracks.contains_key(id));
            if p.is_file() && !listed {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    for t in idx.tracks.values_mut() {
        if t.state == TrackState::Done && !track_file(dir, &t.video_id).is_file() {
            t.state = TrackState::Pending;
            t.attempts = 0;
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub struct DownloadsState {
    inner: Arc<Mutex<Index>>,
    dir: PathBuf,
    wake: Arc<Notify>,
    /// Coalesces `downloads-changed` bursts (progress) to ≤ 2/s.
    emit_pending: Arc<AtomicBool>,
    app: AppHandle,
}

impl DownloadsState {
    fn index_path(&self) -> PathBuf {
        self.dir.join("index.json")
    }

    /// Save + notify the UI. Called with the index lock held so writes
    /// never interleave.
    fn persist(&self, idx: &Index) {
        if let Err(e) = save_index(&self.index_path(), idx) {
            eprintln!("[downloads] save index: {e}");
        }
        if !self.emit_pending.swap(true, Ordering::AcqRel) {
            let inner = self.inner.clone();
            let app = self.app.clone();
            let flag = self.emit_pending.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;
                flag.store(false, Ordering::Release);
                let snapshot = inner.lock().await.clone();
                let _ = app.emit("downloads-changed", &snapshot);
            });
        }
    }

    /// Delete files whose last ref went away. Covers go too unless another
    /// entry still points at the same file.
    fn delete_files(&self, idx: &Index, removed: &[String], covers: Vec<String>) {
        for id in removed {
            let _ = std::fs::remove_file(track_file(&self.dir, id));
        }
        for file in covers {
            let used = idx.tracks.values().any(|t| t.cover_file.as_deref() == Some(&file))
                || idx
                    .collections
                    .values()
                    .any(|c| c.cover_file.as_deref() == Some(&file));
            if !used {
                let _ = std::fs::remove_file(covers_dir(&self.dir).join(file));
            }
        }
    }
}

/// Cover files referenced by these tracks / this collection, captured
/// before they're dropped from the index.
fn covers_of(idx: &Index, track_ids: &[String], collection: Option<&str>) -> Vec<String> {
    let mut out: Vec<String> = track_ids
        .iter()
        .filter_map(|id| idx.tracks.get(id)?.cover_file.clone())
        .collect();
    if let Some(c) = collection.and_then(|c| idx.collections.get(c)) {
        out.extend(c.cover_file.clone());
    }
    out
}

/// Load the index, repair it, and start the download workers.
pub fn init(app: &AppHandle, ytdlp_bin: PathBuf, stream_cache_dir: PathBuf, dir: PathBuf) {
    let _ = std::fs::create_dir_all(tracks_dir(&dir));
    let _ = std::fs::create_dir_all(covers_dir(&dir));
    let mut idx = load_index(&dir.join("index.json"));
    recover(&dir, &mut idx);
    let state = Arc::new(DownloadsState {
        inner: Arc::new(Mutex::new(idx)),
        dir,
        wake: Arc::new(Notify::new()),
        emit_pending: Arc::new(AtomicBool::new(false)),
        app: app.clone(),
    });
    app.manage(state.clone());
    for _ in 0..WORKERS {
        let st = state.clone();
        let bin = ytdlp_bin.clone();
        let cache = stream_cache_dir.clone();
        tauri::async_runtime::spawn(async move { worker(st, bin, cache).await });
    }
    let st = state.clone();
    tauri::async_runtime::spawn(async move { cover_worker(st).await });
}

/// Claim the next pending track not already being fetched by a sibling worker.
async fn claim(st: &DownloadsState, busy: &Mutex<BTreeSet<String>>) -> Option<String> {
    let idx = st.inner.lock().await;
    let mut busy = busy.lock().await;
    let id = idx.next_pending(now_secs(), &busy)?;
    busy.insert(id.clone());
    Some(id)
}

static BUSY: std::sync::OnceLock<Mutex<BTreeSet<String>>> = std::sync::OnceLock::new();

async fn worker(st: Arc<DownloadsState>, ytdlp_bin: PathBuf, stream_cache_dir: PathBuf) {
    let busy = BUSY.get_or_init(|| Mutex::new(BTreeSet::new()));
    loop {
        let Some(id) = claim(&st, busy).await else {
            // Timeout too, so a missed notify can't stall the queue.
            let _ = tokio::time::timeout(Duration::from_secs(30), st.wake.notified()).await;
            continue;
        };
        let result = fetch_track(&st.dir, &id, &ytdlp_bin, &stream_cache_dir).await;
        busy.lock().await.remove(&id);
        let mut idx = st.inner.lock().await;
        let Some(t) = idx.tracks.get_mut(&id) else {
            // Removed while downloading: the file is orphaned.
            let _ = std::fs::remove_file(track_file(&st.dir, &id));
            continue;
        };
        match result {
            Ok(size) => {
                t.state = TrackState::Done;
                t.size = size;
                t.error = None;
            }
            Err(e) => {
                eprintln!("[downloads] {id}: {e}");
                t.attempts += 1;
                t.error = Some(e);
                // 30 s, 60 s: a dropped connection shouldn't burn all
                // attempts in seconds.
                t.next_try = now_secs() + 30 * t.attempts as u64;
                if t.attempts >= MAX_ATTEMPTS {
                    t.state = TrackState::Failed;
                }
            }
        }
        st.persist(&idx);
        drop(idx);
        st.wake.notify_waiters();
    }
}

/// Put `video_id`'s audio at `tracks/<id>.webm`: copy from the stream
/// cache if it's already there, otherwise yt-dlp. Returns the file size.
async fn fetch_track(
    dir: &Path,
    video_id: &str,
    ytdlp_bin: &Path,
    stream_cache_dir: &Path,
) -> Result<u64, String> {
    let dest = track_file(dir, video_id);
    let part = temp_track_file(dir, video_id);
    let cached = stream_cache_dir.join(format!("{video_id}.webm"));
    let cached_len = tokio::fs::metadata(&cached).await.map(|m| m.len()).unwrap_or(0);
    if cached_len >= MIN_AUDIO_BYTES {
        tokio::fs::copy(&cached, &part)
            .await
            .map_err(|e| format!("copy from cache: {e}"))?;
    } else {
        let mut cmd = TokioCommand::new(ytdlp::program(ytdlp_bin));
        cmd.args(YTDLP_AUDIO_ARGS)
            .arg("-o")
            .arg(&part)
            .arg(format!("https://www.youtube.com/watch?v={video_id}"))
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        // Generous cap: a wedged extractor must not hold a worker forever.
        if let Err(e) = run_capped(cmd, Duration::from_secs(600)).await {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(e);
        }
    }
    let size = tokio::fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);
    if size < MIN_AUDIO_BYTES {
        let _ = tokio::fs::remove_file(&part).await;
        return Err("download too small".into());
    }
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| format!("rename: {e}"))?;
    Ok(size)
}

/// Run a child to completion within `limit`; on failure, the last stderr
/// line (≤ 200 chars) is the error.
async fn run_capped(mut cmd: TokioCommand, limit: Duration) -> Result<(), String> {
    // Dropped on timeout → killed, so it can't keep writing the temp file
    // under the next attempt.
    cmd.kill_on_drop(true);
    let mut child = cmd.spawn().map_err(|e| format!("spawn yt-dlp: {e}"))?;
    let mut stderr = String::new();
    let mut pipe = child.stderr.take();
    // One cap over both: reading stderr alone blocks until the child exits.
    let status = tokio::time::timeout(limit, async {
        if let Some(s) = pipe.as_mut() {
            let _ = s.read_to_string(&mut stderr).await;
        }
        child.wait().await
    })
    .await
    .map_err(|_| "yt-dlp timed out".to_string())?
    .map_err(|e| format!("yt-dlp: {e}"))?;
    if status.success() {
        return Ok(());
    }
    let last = stderr
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("yt-dlp failed");
    Err(last.chars().take(200).collect())
}

/// Fetch covers for entries that have a URL but no local file yet. A
/// failure just leaves the remote URL in place (retried next wake).
async fn cover_worker(st: Arc<DownloadsState>) {
    loop {
        let todo: Vec<String> = {
            let idx = st.inner.lock().await;
            let mut urls: Vec<String> = idx
                .tracks
                .values()
                .filter(|t| t.cover_file.is_none())
                .filter_map(|t| t.cover_url.clone())
                .collect();
            urls.extend(
                idx.collections
                    .values()
                    .filter(|c| c.cover_file.is_none())
                    .filter_map(|c| c.cover_url.clone()),
            );
            urls.sort();
            urls.dedup();
            urls
        };
        let mut fetched = Vec::new();
        for url in todo {
            let file = url_to_filename(&url);
            let path = covers_dir(&st.dir).join(&file);
            if !path.exists() {
                match fetch_cover_bytes(&url).await {
                    Ok(bytes) => {
                        if tokio::fs::write(&path, bytes).await.is_err() {
                            continue;
                        }
                    }
                    Err(_) => continue,
                }
            }
            fetched.push((url, file));
        }
        if !fetched.is_empty() {
            let mut idx = st.inner.lock().await;
            for (url, file) in &fetched {
                for t in idx.tracks.values_mut() {
                    if t.cover_url.as_ref() == Some(url) {
                        t.cover_file = Some(file.clone());
                    }
                }
                for c in idx.collections.values_mut() {
                    if c.cover_url.as_ref() == Some(url) {
                        c.cover_file = Some(file.clone());
                    }
                }
            }
            st.persist(&idx);
        }
        let _ = tokio::time::timeout(Duration::from_secs(300), st.wake.notified()).await;
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type St<'a> = tauri::State<'a, Arc<DownloadsState>>;

#[tauri::command]
pub async fn downloads_index(state: St<'_>) -> Result<Index, String> {
    Ok(state.inner.lock().await.clone())
}

#[tauri::command]
pub async fn downloads_set_collection(state: St<'_>, input: CollectionInput) -> Result<(), String> {
    let mut idx = state.inner.lock().await;
    let old: Vec<String> = idx
        .collections
        .get(&input.id)
        .map(|c| c.track_ids.clone())
        .unwrap_or_default();
    let covers = covers_of(&idx, &old, Some(&input.id));
    let removed = idx.apply_collection(input, now_secs())?;
    state.delete_files(&idx, &removed, covers);
    state.persist(&idx);
    drop(idx);
    state.wake.notify_waiters();
    Ok(())
}

#[tauri::command]
pub async fn downloads_remove_collection(state: St<'_>, id: String) -> Result<(), String> {
    let mut idx = state.inner.lock().await;
    let ids = idx
        .collections
        .get(&id)
        .map(|c| c.track_ids.clone())
        .unwrap_or_default();
    let covers = covers_of(&idx, &ids, Some(&id));
    let removed = idx.remove_collection(&id);
    state.delete_files(&idx, &removed, covers);
    state.persist(&idx);
    Ok(())
}

/// Back online (or launch): give every failed track a fresh set of attempts.
#[tauri::command]
pub async fn downloads_retry_failed(state: St<'_>) -> Result<(), String> {
    let mut idx = state.inner.lock().await;
    if idx.retry_failed() {
        state.persist(&idx);
        drop(idx);
        state.wake.notify_waiters();
    }
    Ok(())
}

#[tauri::command]
pub async fn downloads_add_track(state: St<'_>, track: TrackInput) -> Result<(), String> {
    let mut idx = state.inner.lock().await;
    idx.add_single(track)?;
    state.persist(&idx);
    drop(idx);
    state.wake.notify_waiters();
    Ok(())
}

#[tauri::command]
pub async fn downloads_remove_track(state: St<'_>, video_id: String) -> Result<(), String> {
    let mut idx = state.inner.lock().await;
    let covers = covers_of(&idx, std::slice::from_ref(&video_id), None);
    let removed = idx.remove_single(&video_id);
    state.delete_files(&idx, &removed, covers);
    state.persist(&idx);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn t(id: &str) -> TrackInput {
        TrackInput {
            video_id: id.into(),
            meta: json!({ "videoId": id }),
            cover_url: None,
        }
    }

    fn coll(id: &str, ids: &[&str]) -> CollectionInput {
        CollectionInput {
            id: id.into(),
            kind: "playlist".into(),
            title: id.into(),
            subtitle: None,
            cover_url: None,
            owner: None,
            tracks: ids.iter().map(|i| t(i)).collect(),
        }
    }

    fn refs(idx: &Index, id: &str) -> Vec<String> {
        idx.tracks[id].refs.iter().cloned().collect()
    }

    #[test]
    fn apply_adds_pending_tracks_with_ref() {
        let mut idx = Index::default();
        assert!(idx.apply_collection(coll("P1", &["a", "b"]), 1).unwrap().is_empty());
        assert_eq!(idx.collections["P1"].track_ids, vec!["a", "b"]);
        assert_eq!(idx.tracks["a"].state, TrackState::Pending);
        assert_eq!(refs(&idx, "b"), vec!["P1"]);
    }

    #[test]
    fn shared_track_survives_one_removal() {
        let mut idx = Index::default();
        idx.apply_collection(coll("P1", &["a", "b"]), 1).unwrap();
        idx.apply_collection(coll("P2", &["b"]), 1).unwrap();
        assert_eq!(idx.remove_collection("P1"), vec!["a"]);
        assert!(!idx.collections.contains_key("P1"));
        assert_eq!(refs(&idx, "b"), vec!["P2"]);
    }

    #[test]
    fn resync_drops_removed_tracks() {
        let mut idx = Index::default();
        idx.apply_collection(coll("P1", &["a", "b"]), 1).unwrap();
        assert_eq!(idx.apply_collection(coll("P1", &["b", "c"]), 2).unwrap(), vec!["a"]);
        assert_eq!(idx.tracks["c"].state, TrackState::Pending);
        assert_eq!(idx.collections["P1"].synced_at, 2);
    }

    #[test]
    fn resync_retries_failed() {
        let mut idx = Index::default();
        idx.apply_collection(coll("P1", &["a"]), 1).unwrap();
        let a = idx.tracks.get_mut("a").unwrap();
        a.state = TrackState::Failed;
        a.attempts = 3;
        a.error = Some("boom".into());
        idx.apply_collection(coll("P1", &["a"]), 2).unwrap();
        assert_eq!(idx.tracks["a"].state, TrackState::Pending);
        assert_eq!(idx.tracks["a"].attempts, 0);
    }

    #[test]
    fn single_and_collection_share_file() {
        let mut idx = Index::default();
        idx.add_single(t("a")).unwrap();
        idx.apply_collection(coll("P1", &["a"]), 1).unwrap();
        assert!(idx.remove_single("a").is_empty());
        assert_eq!(idx.remove_collection("P1"), vec!["a"]);
        assert!(idx.tracks.is_empty());
    }

    #[test]
    fn rejects_bad_video_ids() {
        let mut idx = Index::default();
        assert!(idx.apply_collection(coll("P1", &["ok", "../x"]), 1).is_err());
        assert!(idx.collections.is_empty() && idx.tracks.is_empty());
        assert!(idx.add_single(t("a/b")).is_err());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!("ytubic-dl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("index.json");
        let mut idx = Index::default();
        idx.apply_collection(coll("P1", &["a"]), 7).unwrap();
        save_index(&path, &idx).unwrap();
        let back = load_index(&path);
        assert_eq!(back.collections["P1"].synced_at, 7);
        assert_eq!(refs(&back, "a"), vec!["P1"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn stale_part_files_are_not_done() {
        let dir = std::env::temp_dir().join(format!("ytubic-dl-rec-{}", std::process::id()));
        std::fs::create_dir_all(tracks_dir(&dir)).unwrap();
        std::fs::write(temp_track_file(&dir, "a"), b"half").unwrap();
        // Debris from the old `.part` naming, which yt-dlp silently stripped.
        std::fs::write(tracks_dir(&dir).join("b"), b"orphan").unwrap();
        let mut idx = Index::default();
        idx.apply_collection(coll("P1", &["a"]), 1).unwrap();
        idx.tracks.get_mut("a").unwrap().state = TrackState::Done;
        recover(&dir, &mut idx);
        assert!(!temp_track_file(&dir, "a").exists());
        assert!(!tracks_dir(&dir).join("b").exists());
        assert_eq!(idx.tracks["a"].state, TrackState::Pending);
        assert!(downloaded_track_path(&dir, "a").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // yt-dlp strips a trailing ".part" from `-o` (it's its own temp
    // suffix), so a `.part` temp name never appears on disk.
    #[test]
    fn temp_name_survives_ytdlp() {
        let p = temp_track_file(Path::new("x"), "abc");
        assert_ne!(p.extension().and_then(|e| e.to_str()), Some("part"));
        assert_ne!(p, track_file(Path::new("x"), "abc"));
    }

    // A wedged yt-dlp must hit the cap even while it holds stderr open.
    #[test]
    fn run_capped_times_out_a_hung_child() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            #[cfg(windows)]
            let mut cmd = {
                let mut c = TokioCommand::new("ping");
                c.args(["-n", "6", "127.0.0.1"]);
                c
            };
            #[cfg(not(windows))]
            let mut cmd = {
                let mut c = TokioCommand::new("sleep");
                c.arg("5");
                c
            };
            cmd.stdout(Stdio::null()).stderr(Stdio::piped());
            let t0 = std::time::Instant::now();
            let r = run_capped(cmd, Duration::from_millis(500)).await;
            assert_eq!(r, Err("yt-dlp timed out".to_string()));
            assert!(t0.elapsed() < Duration::from_secs(3));
        });
    }

    // The index outlives app versions: older files must load as fields
    // are added (a parse failure would orphan every download).
    #[test]
    fn index_missing_newer_fields_still_loads() {
        let json = r#"{"version":1,"collections":{"P1":{"id":"P1","kind":"playlist","title":"t","trackIds":["a"],"syncedAt":1}},"tracks":{"a":{"videoId":"a","meta":null,"state":"done","refs":["P1"]}}}"#;
        let idx: Index = serde_json::from_str(json).unwrap();
        assert_eq!(idx.tracks["a"].state, TrackState::Done);
        assert_eq!(idx.tracks["a"].attempts, 0);
        assert_eq!(idx.collections["P1"].owner, None);
    }

    #[test]
    fn recover_sweeps_unlisted_files() {
        let dir = std::env::temp_dir().join(format!("ytubic-dl-sweep-{}", std::process::id()));
        std::fs::create_dir_all(tracks_dir(&dir)).unwrap();
        std::fs::write(track_file(&dir, "kept"), b"x").unwrap();
        std::fs::write(track_file(&dir, "orphan"), b"x").unwrap();
        let mut idx = Index::default();
        idx.add_single(t("kept")).unwrap();
        recover(&dir, &mut idx);
        assert!(track_file(&dir, "kept").exists());
        assert!(!track_file(&dir, "orphan").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn next_pending_waits_out_backoff() {
        let mut idx = Index::default();
        idx.add_single(t("a")).unwrap();
        idx.add_single(t("b")).unwrap();
        idx.tracks.get_mut("a").unwrap().next_try = 100;
        let busy = BTreeSet::new();
        assert_eq!(idx.next_pending(50, &busy).as_deref(), Some("b"));
        let busy: BTreeSet<String> = ["b".to_string()].into();
        assert_eq!(idx.next_pending(50, &busy), None);
        assert_eq!(idx.next_pending(100, &busy).as_deref(), Some("a"));
    }

    #[test]
    fn retry_failed_requeues_everything_failed() {
        let mut idx = Index::default();
        idx.add_single(t("a")).unwrap();
        let a = idx.tracks.get_mut("a").unwrap();
        a.state = TrackState::Failed;
        a.attempts = 3;
        a.next_try = 999;
        assert!(idx.retry_failed());
        assert_eq!(idx.tracks["a"].state, TrackState::Pending);
        assert_eq!((idx.tracks["a"].attempts, idx.tracks["a"].next_try), (0, 0));
        assert!(!idx.retry_failed());
    }

    #[test]
    fn collection_keeps_owner() {
        let mut idx = Index::default();
        let mut c = coll("LM", &["a"]);
        c.owner = Some("acct1".into());
        idx.apply_collection(c, 1).unwrap();
        assert_eq!(idx.collections["LM"].owner.as_deref(), Some("acct1"));
    }

    #[test]
    fn corrupt_index_loads_default() {
        let dir = std::env::temp_dir().join(format!("ytubic-dl-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("index.json");
        std::fs::write(&path, b"{not json").unwrap();
        let idx = load_index(&path);
        assert!(idx.tracks.is_empty());
        assert!(dir.join("index.json.bad").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
