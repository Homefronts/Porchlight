//! Byte source for the decoder: the local stream server's
//! `GET /stream/:video_id`, read with Range requests so Symphonia can seek.

use std::fmt;
use std::io::{self, Read, Seek, SeekFrom};
use std::time::Duration;
use symphonia::core::io::MediaSource;

/// Codes match HTMLMediaElement's MEDIA_ERR_* (src/lib/audio-engine.ts).
#[derive(Debug, Clone, PartialEq)]
pub enum MediaError {
    Network(String),
    Decode(String),
    Unsupported(String),
}

impl MediaError {
    pub fn code(&self) -> u8 {
        match self {
            MediaError::Network(_) => 2,
            MediaError::Decode(_) => 3,
            MediaError::Unsupported(_) => 4,
        }
    }
}

impl fmt::Display for MediaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for MediaError {}

pub struct HttpSource {
    client: reqwest::blocking::Client,
    url: String,
    len: u64,
    pos: u64,
    /// Open response whose body continues at `pos`; dropped on seek.
    /// Mutex only to make the source Sync (MediaSource requires it); every
    /// access is through &mut self, so it is never contended.
    body: std::sync::Mutex<Option<reqwest::blocking::Response>>,
}

impl HttpSource {
    /// Blocking (reqwest::blocking): call, use and drop it on a plain
    /// thread, never on a tokio worker thread.
    pub fn open(url: &str) -> Result<Self, MediaError> {
        // The stream server holds the first request until the file is cached
        // (up to 120 s); after that a body read that stalls 30 s is an error.
        Self::open_with(url, Duration::from_secs(130), Duration::from_secs(30))
    }

    fn open_with(url: &str, first_wait: Duration, read_timeout: Duration) -> Result<Self, MediaError> {
        // reqwest blocking's `timeout` bounds the wait for headers and each
        // body read alike, so it is our read timeout.
        let client = reqwest::blocking::Client::builder()
            .timeout(read_timeout)
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| MediaError::Network(e.to_string()))?;
        let resp = request(&client, url, 0, Some(first_wait)).map_err(|e| MediaError::Network(e.to_string()))?;
        // 206 carries the total after the slash; a plain 200 is the whole file.
        let len = resp
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok()?.rsplit('/').next()?.parse().ok())
            .or(resp.content_length())
            .ok_or_else(|| MediaError::Network("stream has no length".into()))?;
        // That response's body reads would inherit the long wait, so drop it;
        // the first read re-requests (from cache by now) with the read timeout.
        drop(resp);
        Ok(Self { client, url: url.to_string(), len, pos: 0, body: std::sync::Mutex::new(None) })
    }
}

/// GET `url` from byte `from` on; any non-2xx status is an error.
fn request(
    client: &reqwest::blocking::Client,
    url: &str,
    from: u64,
    wait: Option<Duration>,
) -> io::Result<reqwest::blocking::Response> {
    let mut req = client.get(url).header(reqwest::header::RANGE, format!("bytes={from}-"));
    if let Some(wait) = wait {
        req = req.timeout(wait);
    }
    let resp = req.send().map_err(io::Error::other)?;
    let status = resp.status();
    if !status.is_success() {
        return Err(io::Error::other(format!("HTTP {status}")));
    }
    if from > 0 && status != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(io::Error::other("server ignored Range"));
    }
    Ok(resp)
}

impl Read for HttpSource {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pos >= self.len || buf.is_empty() {
            return Ok(0);
        }
        let body = self.body.get_mut().unwrap_or_else(|e| e.into_inner());
        if body.is_none() {
            *body = Some(request(&self.client, &self.url, self.pos, None)?);
        }
        // Never UnexpectedEof: the decoder reads that as a clean end of file,
        // but a body that fails or ends before `len` is a network error.
        let aborted = |e: io::Error| io::Error::new(io::ErrorKind::ConnectionAborted, e);
        let n = body.as_mut().unwrap().read(buf).map_err(aborted)?;
        if n == 0 {
            return Err(aborted(io::Error::other("body ended before its length")));
        }
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for HttpSource {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let target = match to {
            SeekFrom::Start(p) => Some(p),
            SeekFrom::End(d) => self.len.checked_add_signed(d),
            SeekFrom::Current(d) => self.pos.checked_add_signed(d),
        }
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "seek before start"))?;
        if target != self.pos {
            self.pos = target;
            *self.body.get_mut().unwrap_or_else(|e| e.into_inner()) = None;
        }
        Ok(target)
    }
}

impl MediaSource for HttpSource {
    fn is_seekable(&self) -> bool {
        true
    }
    fn byte_len(&self) -> Option<u64> {
        Some(self.len)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/tone440-3s.webm");

    /// Serves tests/fixtures (with Range support) on a free port; the runtime
    /// must outlive the requests.
    fn serve_fixtures() -> (tokio::runtime::Runtime, String) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let listener = rt
            .block_on(tokio::net::TcpListener::bind("127.0.0.1:0"))
            .unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
        let app = axum::Router::new().nest_service("/stream", tower_http::services::ServeDir::new(dir));
        rt.spawn(async move { axum::serve(listener, app).await.unwrap() });
        (rt, base)
    }

    #[test]
    fn error_codes() {
        assert_eq!(MediaError::Network(String::new()).code(), 2);
        assert_eq!(MediaError::Decode(String::new()).code(), 3);
        assert_eq!(MediaError::Unsupported(String::new()).code(), 4);
    }

    #[test]
    fn reads_and_seeks_like_the_file() {
        let file = std::fs::read(FIXTURE).unwrap();
        let (_rt, base) = serve_fixtures();
        let mut src = HttpSource::open(&format!("{base}/stream/tone440-3s.webm")).unwrap();
        assert_eq!(src.byte_len(), Some(file.len() as u64));

        let mut all = Vec::new();
        src.read_to_end(&mut all).unwrap();
        assert_eq!(all, file);

        assert_eq!(src.seek(SeekFrom::Start(1000)).unwrap(), 1000);
        let mut buf = [0u8; 100];
        src.read_exact(&mut buf).unwrap();
        assert_eq!(&buf[..], &file[1000..1100]);

        // backwards, relative to the current position
        assert_eq!(src.seek(SeekFrom::Current(-600)).unwrap(), 500);
        src.read_exact(&mut buf).unwrap();
        assert_eq!(&buf[..], &file[500..600]);

        src.seek(SeekFrom::End(-10)).unwrap();
        let mut tail = Vec::new();
        src.read_to_end(&mut tail).unwrap();
        assert_eq!(&tail[..], &file[file.len() - 10..]);
    }

    /// Answers every request with a 206 whose Content-Range promises the
    /// whole fixture but sends only its first `sent` bytes. `stall`: the
    /// Content-Length promises the rest too and the socket is held open;
    /// otherwise the body ends cleanly (Content-Length = sent), short of the range.
    fn short_server(sent: usize, stall: bool) -> String {
        use std::io::Write;
        let file = std::fs::read(FIXTURE).unwrap();
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", l.local_addr().unwrap());
        std::thread::spawn(move || {
            for mut s in l.incoming().flatten() {
                let file = file.clone();
                std::thread::spawn(move || {
                    let _ = s.read(&mut [0u8; 4096]);
                    let n = file.len();
                    let body_len = if stall { n } else { sent };
                    let head = format!(
                        "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 0-{}/{n}\r\nContent-Length: {body_len}\r\n\r\n",
                        n - 1
                    );
                    let _ = s.write_all(head.as_bytes());
                    let _ = s.write_all(&file[..sent]);
                    let _ = s.flush();
                    if stall {
                        std::thread::sleep(Duration::from_secs(20));
                    }
                });
            }
        });
        base
    }

    #[test]
    fn truncated_body_is_network_error() {
        let src = HttpSource::open(&format!("{}/stream/x", short_server(200, false))).unwrap();
        let err = crate::player::decode::Decoder::open(Box::new(src), None).err().unwrap();
        assert_eq!(err.code(), 2, "{err}");
    }

    #[test]
    fn stalled_body_times_out_as_network_error() {
        let url = format!("{}/stream/x", short_server(200, true));
        let src = HttpSource::open_with(&url, Duration::from_secs(5), Duration::from_millis(300)).unwrap();
        let t = std::time::Instant::now();
        let err = crate::player::decode::Decoder::open(Box::new(src), None).err().unwrap();
        assert_eq!(err.code(), 2, "{err}");
        assert!(t.elapsed() < Duration::from_secs(3), "{:?}", t.elapsed());
    }

    #[test]
    fn not_found_is_network_error() {
        let (_rt, base) = serve_fixtures();
        let err = HttpSource::open(&format!("{base}/stream/missing.webm")).err().unwrap();
        assert_eq!(err.code(), 2, "{err}");
    }

    #[test]
    fn closed_port_is_network_error() {
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let err = HttpSource::open(&format!("http://127.0.0.1:{port}/stream/x")).err().unwrap();
        assert!(matches!(err, MediaError::Network(_)), "{err}");
    }
}
