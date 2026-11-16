//! Native audio engine: porchlight.exe plays the music itself.
//!
//! Threads:
//! - one decode worker per load (source -> decode -> resample/stretch), pushing
//!   frames into its slot's lock-free SPSC ring;
//! - the audio callback (`Renderer`): pops both rings, ramps, mixes, runs the
//!   shared chain (EQ -> mono -> normalize) and pushes mono samples into the
//!   analysis ring. Control reaches it through a command ring and atomics;
//! - the reporter: owns the `Analyser`, sends state and analysis events;
//! - the device thread: owns the `Output`, follows default/lost devices.

pub mod analysis;
pub mod commands;
pub mod decode;
pub mod dsp;
pub mod output;
pub mod source;
pub mod stretch;
#[cfg(test)]
mod tests;

use analysis::Analyser;
use decode::Decoder;
use dsp::{Compressor, Curve, Eq9, Ramp};
use output::{Output, Render};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};
use source::MediaError;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering::Relaxed};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use stretch::Stretcher;

/// Per-slot PCM ring: ~170 ms at 48 kHz. Seeks, loads and speed changes
/// flush it (a speed change re-seeks), so it adds no control latency.
const RING_FRAMES: usize = 8192;
/// Pause / play / seek declick ramp.
const DECLICK_SEC: f32 = 0.005;
/// Volume changes glide this long (no zipper noise).
const GAIN_SEC: f32 = 0.02;
const REPORT_EVERY: Duration = Duration::from_millis(250);
const TICK: Duration = Duration::from_millis(16);
const DEVICE_POLL: Duration = Duration::from_secs(1);
/// Close the output after this long with nothing playing (lets Windows sleep).
const IDLE_STOP: Duration = Duration::from_secs(10);
/// Sample rate assumed until the first stream opens.
const DEFAULT_RATE: u32 = 48000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Slot {
    A,
    B,
}

impl Slot {
    fn idx(self) -> usize {
        self as usize
    }
}

const SLOTS: [Slot; 2] = [Slot::A, Slot::B];

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PlayerEvent {
    State {
        slot: Slot,
        generation: u64,
        position: f64,
        /// null while unknown (still loading).
        duration: Option<f64>,
        playing: bool,
        loading: bool,
        /// True in exactly one report when playback reaches the end.
        ended: bool,
        /// MEDIA_ERR_* code; stays set until the next load.
        #[serde(skip_serializing_if = "Option::is_none")]
        error_code: Option<u8>,
    },
    Analysis {
        bins: Vec<u8>,
        rms: f32,
    },
}

/// Returns false once the receiver is gone; the engine then drops it.
pub type Sink = Box<dyn Fn(PlayerEvent) -> bool + Send>;

#[derive(Clone, Copy, Default)]
struct Frame {
    s: [f32; 2],
    /// Source position (seconds) of this frame.
    pos: f64,
    /// Seek/load epoch the frame belongs to; older ones are dropped.
    epoch: u32,
}

/// Fades are events (each one starts a ramp now), so they queue.
#[derive(Clone, Copy)]
struct Fade(usize, f32, f32, Curve);

/// Settings are state: the latest value wins, so they never queue and a
/// change made while no stream runs is applied when one starts.
#[derive(Clone, Copy, PartialEq)]
struct Settings {
    eq: (bool, [f32; 9]),
    mono: bool,
    normalize: bool,
    gain: [f32; 2],
}

impl Default for Settings {
    fn default() -> Self {
        Settings { eq: (false, [0.0; 9]), mono: false, normalize: false, gain: [1.0; 2] }
    }
}

enum Ctl {
    Seek(f64, u32),
    Speed(f32),
    /// play(): stop blocking while paused.
    Wake,
}

/// Control-side slot state. Never touched by the audio callback.
struct Info {
    generation: u64,
    loaded: bool,
    loading: bool,
    duration: Option<f64>,
    error: Option<u8>,
    /// Position to report until frames of the current epoch play.
    seek_target: f64,
    speed: f32,
    epoch: u32,
    /// Epoch whose end has been reported (`ended` goes out once).
    ended_reported: u32,
    load_id: u64,
    worker: Option<Sender<Ctl>>,
}

struct SlotShared {
    // Read by the audio callback.
    want_epoch: AtomicU32,
    playing: AtomicBool,
    eos_epoch: AtomicU32,
    // Written by the audio callback.
    pos: AtomicU64,
    pos_epoch: AtomicU32,
    ended_epoch: AtomicU32,
    /// Ask the reporter for an immediate state report.
    notify: AtomicBool,
    info: Mutex<Info>,
    /// Only decode workers lock this (the old and new one after a load).
    producer: Mutex<Producer<Frame>>,
}

struct Inner {
    slots: [SlotShared; 2],
    fades: Mutex<Producer<Fade>>,
    settings: Mutex<Settings>,
    /// Settings changed since the callback last copied them.
    settings_dirty: AtomicBool,
    /// The callback is producing sound (some declick ramp is above 0).
    active: AtomicBool,
    out_rate: AtomicU32,
    analysis: AtomicBool,
    sink: Mutex<Option<Sink>>,
    shutdown: AtomicBool,
    reporter: std::sync::OnceLock<std::thread::Thread>,
    /// Last device list seen by the device thread (read without blocking).
    devices: Mutex<Vec<String>>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Inner {
    fn fade(&self, f: Fade) {
        if lock(&self.fades).push(f).is_err() {
            eprintln!("[player] fade ring full, dropped");
        }
    }

    fn settings(&self, change: impl FnOnce(&mut Settings)) {
        change(&mut lock(&self.settings));
        self.settings_dirty.store(true, Relaxed);
    }

    /// Ask the reporter for an immediate state report of slot `i`.
    fn wake(&self, i: usize) {
        self.slots[i].notify.store(true, Relaxed);
        if let Some(t) = self.reporter.get() {
            t.unpark();
        }
    }

    fn position(&self, i: usize, info: &Info) -> f64 {
        let s = &self.slots[i];
        if s.pos_epoch.load(Relaxed) == info.epoch {
            f64::from_bits(s.pos.load(Relaxed))
        } else {
            info.seek_target
        }
    }

    /// New epoch: the callback ramps out, drops older frames, the worker seeks.
    fn seek(&self, i: usize, info: &mut Info, seconds: f64) {
        let t = match info.duration {
            Some(d) => seconds.clamp(0.0, d),
            None => seconds.max(0.0),
        };
        info.epoch += 1;
        self.slots[i].want_epoch.store(info.epoch, Relaxed);
        info.seek_target = t;
        if let Some(w) = &info.worker {
            let _ = w.send(Ctl::Seek(t, info.epoch));
        }
        self.wake(i);
    }

    fn emit(&self, e: PlayerEvent) {
        let mut sink = lock(&self.sink);
        // A closed Channel (webview reloaded) stays dead: stop serializing for it.
        if sink.as_ref().is_some_and(|s| !s(e)) {
            *sink = None;
        }
    }

    /// Sent while holding the slot's info lock, so a report can never cross
    /// a newer load of that slot.
    fn emit_state(&self, i: usize) {
        let s = &self.slots[i];
        let mut info = lock(&s.info);
        if !info.loaded {
            return;
        }
        let ended = s.ended_epoch.load(Relaxed) == info.epoch && info.ended_reported != info.epoch;
        if ended {
            info.ended_reported = info.epoch;
        }
        self.emit(PlayerEvent::State {
            slot: SLOTS[i],
            generation: info.generation,
            position: self.position(i, &info),
            duration: info.duration,
            playing: s.playing.load(Relaxed),
            loading: info.loading,
            ended,
            error_code: info.error,
        });
    }
}

// ---------------------------------------------------------------- audio thread

struct SlotRender {
    cons: Consumer<Frame>,
    /// Epoch of the frames being played.
    epoch: u32,
    run: Ramp,
    run_target: f32,
    fade: Ramp,
    gain: Ramp,
    pos: f64,
    pos_epoch: u32,
    ended_epoch: u32,
}

/// Per-callback copy of a slot's atomics.
struct Live {
    want: u32,
    playing: bool,
    eos: u32,
    ended: bool,
}

impl SlotRender {
    fn next(&mut self, l: &mut Live, rate: f32) -> [f32; 2] {
        if self.epoch != l.want && self.run.value() == 0.0 {
            self.epoch = l.want;
        }
        let stale = self.epoch != l.want;
        // Epochs only grow: drop older frames, keep newer ones for after
        // a seek's ramp-out.
        while let Ok(f) = self.cons.peek() {
            if f.epoch >= self.epoch {
                break;
            }
            let _ = self.cons.pop();
        }
        let has = self.cons.peek().is_ok_and(|f| f.epoch == self.epoch);
        let target = if l.playing && !stale && has { 1.0 } else { 0.0 };
        if target != self.run_target {
            self.run.to(target, DECLICK_SEC, rate, Curve::Linear);
            self.run_target = target;
        }
        let g = self.run.next();
        let mut x = [0.0; 2];
        if g > 0.0 && has {
            if let Ok(f) = self.cons.pop() {
                x = [f.s[0] * g, f.s[1] * g];
                self.pos = f.pos;
                self.pos_epoch = f.epoch;
            }
        }
        if !stale && !has && self.epoch != 0 && l.eos == self.epoch && self.ended_epoch != self.epoch {
            self.ended_epoch = self.epoch;
            l.ended = true;
            l.playing = false;
        }
        let v = self.gain.next() * self.fade.next();
        [x[0] * v, x[1] * v]
    }
}

pub(crate) struct Renderer {
    inner: Arc<Inner>,
    slots: [SlotRender; 2],
    fades: Consumer<Fade>,
    tap: Producer<f32>,
    rate: f32,
    eq: Eq9,
    comp: Compressor,
    /// Settings as last applied.
    set: Settings,
}

/// Denormals would slow the filters to a crawl during long silences.
#[inline]
fn flush_denormals() {
    #[cfg(target_arch = "x86_64")]
    unsafe {
        let mut csr = 0u32;
        std::arch::asm!("stmxcsr [{}]", in(reg) &mut csr, options(nostack));
        csr |= 0x8040; // FTZ | DAZ
        std::arch::asm!("ldmxcsr [{}]", in(reg) &csr, options(nostack));
    }
    #[cfg(target_arch = "aarch64")]
    unsafe {
        let mut fpcr: u64;
        std::arch::asm!("mrs {}, fpcr", out(reg) fpcr, options(nomem, nostack));
        fpcr |= 1 << 24; // FZ
        std::arch::asm!("msr fpcr, {}", in(reg) fpcr, options(nomem, nostack));
    }
}

impl Renderer {
    fn set_rate(&mut self, rate: u32) {
        self.rate = rate as f32;
        self.eq = Eq9::new(self.rate);
        self.eq.set(self.set.eq.0, self.set.eq.1);
        self.comp = Compressor::new(self.rate);
    }

    /// Copy changed settings. try_lock only: if control holds the lock right
    /// now, the change lands on the next callback.
    fn pull_settings(&mut self) {
        if !self.inner.settings_dirty.swap(false, Relaxed) {
            return;
        }
        let Ok(new) = self.inner.settings.try_lock().map(|s| *s) else {
            self.inner.settings_dirty.store(true, Relaxed);
            return;
        };
        if new.eq != self.set.eq {
            self.eq.set(new.eq.0, new.eq.1);
        }
        for (i, slot) in self.slots.iter_mut().enumerate() {
            if new.gain[i] != self.set.gain[i] {
                slot.gain.to(new.gain[i], GAIN_SEC, self.rate, Curve::Linear);
            }
        }
        self.set = new;
    }

    /// The audio callback: no locks, no allocation, never blocks.
    fn render(&mut self, buf: &mut [f32], channels: usize) {
        flush_denormals();
        self.pull_settings();
        while let Ok(Fade(i, target, secs, curve)) = self.fades.pop() {
            self.slots[i].fade.to(target, secs, self.rate, curve);
        }
        let inner = &self.inner;
        let mut live = inner.slots.each_ref().map(|s| Live {
            want: s.want_epoch.load(Relaxed),
            playing: s.playing.load(Relaxed),
            eos: s.eos_epoch.load(Relaxed),
            ended: false,
        });
        let tap = inner.analysis.load(Relaxed);
        for frame in buf.chunks_exact_mut(channels.max(1)) {
            let mut m = [0f32; 2];
            for (slot, l) in self.slots.iter_mut().zip(&mut live) {
                let x = slot.next(l, self.rate);
                m[0] += x[0];
                m[1] += x[1];
            }
            self.eq.process(&mut m);
            if self.set.mono {
                dsp::fold_mono(&mut m);
            }
            if self.set.normalize {
                self.comp.process(&mut m);
            }
            if tap {
                let _ = self.tap.push((m[0] + m[1]) * 0.5);
            }
            if let [only] = frame {
                *only = (m[0] + m[1]) * 0.5;
            } else {
                frame[0] = m[0];
                frame[1] = m[1];
                frame[2..].fill(0.0);
            }
        }
        for ((s, r), l) in inner.slots.iter().zip(&self.slots).zip(&live) {
            s.pos.store(r.pos.to_bits(), Relaxed);
            s.pos_epoch.store(r.pos_epoch, Relaxed);
            if l.ended {
                s.playing.store(false, Relaxed);
                s.ended_epoch.store(r.ended_epoch, Relaxed);
                s.notify.store(true, Relaxed);
            }
        }
        let active = self.slots.iter().any(|r| r.run_target > 0.0 || r.run.value() > 0.0);
        inner.active.store(active, Relaxed);
    }
}

// ---------------------------------------------------------------- decode worker

struct Job {
    url: String,
    start_at: f64,
    fallback: Option<f64>,
    epoch: u32,
    load_id: u64,
    speed: f32,
}

fn open_source(url: &str) -> Result<Box<dyn symphonia::core::io::MediaSource>, MediaError> {
    if url.starts_with("http://") || url.starts_with("https://") {
        // shortcut: a superseded load keeps its request open until the server answers (up to 130 s); add a cancel flag to HttpSource if rapid skipping piles up threads.
        return Ok(Box::new(source::HttpSource::open(url)?));
    }
    #[cfg(test)]
    return match std::fs::File::open(url) {
        Ok(f) => Ok(Box::new(f)),
        Err(e) => Err(MediaError::Network(e.to_string())),
    };
    #[cfg(not(test))]
    Err(MediaError::Unsupported(format!("not a stream url: {url}")))
}

struct Worker {
    inner: Arc<Inner>,
    i: usize,
    load_id: u64,
    dec: Decoder,
    st: Stretcher,
    st_rate: u32,
    speed: f32,
    /// Speed last given to the stretcher; NaN forces a re-apply.
    applied: f32,
    epoch: u32,
    pending: Vec<Frame>,
    sent: usize,
    prev_end: f64,
    eof: bool,
    failed: bool,
    buf: Vec<f32>,
    out: Vec<f32>,
}

/// Body of a load's thread. Runs (and drops the blocking HTTP source) on a
/// plain thread; exits when the slot drops its sender (next load/unload).
fn run_worker(inner: Arc<Inner>, i: usize, job: Job, rx: Receiver<Ctl>) {
    let opened = open_source(&job.url).and_then(|src| Decoder::open(src, job.fallback));
    let dec = {
        let s = &inner.slots[i];
        let mut info = lock(&s.info);
        if info.load_id != job.load_id {
            return;
        }
        info.loading = false;
        inner.wake(i);
        match opened {
            Ok(d) => {
                info.duration = d.duration();
                d
            }
            Err(e) => {
                info.error = Some(e.code());
                return;
            }
        }
    };
    let rate = inner.out_rate.load(Relaxed);
    let mut w = Worker {
        st: Stretcher::new(dec.sample_rate(), rate),
        st_rate: rate,
        inner,
        i,
        load_id: job.load_id,
        dec,
        speed: job.speed,
        applied: 1.0,
        epoch: job.epoch,
        pending: Vec::new(),
        sent: 0,
        prev_end: 0.0,
        eof: false,
        failed: false,
        buf: Vec::new(),
        out: Vec::new(),
    };
    if job.start_at > 0.0 {
        w.handle(Ctl::Seek(job.start_at, job.epoch));
    }
    w.run(rx);
}

impl Worker {
    fn run(mut self, rx: Receiver<Ctl>) {
        loop {
            loop {
                match rx.try_recv() {
                    Ok(c) => self.handle(c),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => return,
                }
            }
            if self.sent < self.pending.len() {
                if !self.push() {
                    // Ring full. Paused, it won't drain: block until play()
                    // (Ctl::Wake) or another command instead of polling.
                    let msg = if self.inner.slots[self.i].playing.load(Relaxed) {
                        rx.recv_timeout(Duration::from_millis(5))
                    } else {
                        rx.recv().map_err(|_| RecvTimeoutError::Disconnected)
                    };
                    match msg {
                        Ok(c) => self.handle(c),
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
                continue;
            }
            if self.eof || self.failed {
                if !self.failed {
                    // Every frame of this epoch is in the ring.
                    self.inner.slots[self.i].eos_epoch.store(self.epoch, Relaxed);
                }
                match rx.recv() {
                    Ok(c) => self.handle(c),
                    Err(_) => return,
                }
                continue;
            }
            self.decode();
        }
    }

    /// Push pending frames; false when the ring filled up first.
    fn push(&mut self) -> bool {
        let mut p = lock(&self.inner.slots[self.i].producer);
        while self.sent < self.pending.len() {
            if p.push(self.pending[self.sent]).is_err() {
                return false;
            }
            self.sent += 1;
        }
        self.pending.clear();
        self.sent = 0;
        true
    }

    fn decode(&mut self) {
        self.out.clear();
        match self.dec.next_frames(&mut self.buf) {
            Ok(true) => {
                // A NaN would stick in the EQ and analysis state.
                for x in &mut self.buf {
                    if !x.is_finite() {
                        *x = 0.0;
                    }
                }
                // Applied only right before a process(), never right before finish().
                if self.applied != self.speed {
                    self.st.set_speed(self.speed);
                    self.applied = self.speed;
                }
                self.st.process(&self.buf, &mut self.out);
                let lag = self.st.latency_frames() as f64 * self.speed as f64 / self.st_rate as f64;
                self.queue(self.dec.position() - lag);
            }
            Ok(false) => {
                self.st.finish(&mut self.out);
                self.queue(self.dec.position());
                self.eof = true;
            }
            Err(e) => self.fail(e),
        }
    }

    /// Queue `out` as frames whose positions spread evenly up to `end`.
    fn queue(&mut self, end: f64) {
        let n = self.out.len() / 2;
        let end = end.max(self.prev_end);
        for (k, s) in self.out.as_chunks::<2>().0.iter().enumerate() {
            let pos = self.prev_end + (end - self.prev_end) * (k + 1) as f64 / n as f64;
            self.pending.push(Frame { s: *s, pos, epoch: self.epoch });
        }
        self.prev_end = end;
    }

    fn handle(&mut self, c: Ctl) {
        match c {
            Ctl::Speed(v) => self.speed = v,
            Ctl::Wake => {}
            Ctl::Seek(t, epoch) => {
                self.epoch = epoch;
                self.pending.clear();
                self.sent = 0;
                self.eof = false;
                self.failed = false;
                let rate = self.inner.out_rate.load(Relaxed);
                if rate != self.st_rate {
                    self.st = Stretcher::new(self.dec.sample_rate(), rate);
                    self.st_rate = rate;
                } else {
                    self.st.reset();
                }
                self.applied = f32::NAN;
                match self.dec.seek(t) {
                    Ok(landed) => {
                        self.prev_end = landed;
                        let mut info = lock(&self.inner.slots[self.i].info);
                        if info.epoch == epoch {
                            info.seek_target = landed;
                        }
                    }
                    Err(e) => self.fail(e),
                }
            }
        }
    }

    fn fail(&mut self, e: MediaError) {
        eprintln!("[player] slot {} failed: {e}", self.i);
        self.failed = true;
        let s = &self.inner.slots[self.i];
        let mut info = lock(&s.info);
        if info.load_id == self.load_id {
            info.error = Some(e.code());
            self.inner.wake(self.i);
        }
    }
}

// ---------------------------------------------------------------- reporter

/// Longer than any device period, so a playing stream never counts as starved.
const STARVED: Duration = Duration::from_millis(100);

fn run_reporter(inner: Arc<Inner>, mut tap: Consumer<f32>) {
    let mut analyser = Analyser::new();
    let mut fed = Instant::now();
    let mut last = Instant::now();
    while !inner.shutdown.load(Relaxed) {
        // 60 Hz only while something plays or the visualizer is on; idle,
        // wake 4 times a second or when `Inner::wake` unparks us.
        let busy = inner.analysis.load(Relaxed) || inner.slots.iter().any(|s| s.playing.load(Relaxed));
        if busy {
            std::thread::sleep(TICK);
        } else {
            std::thread::park_timeout(REPORT_EVERY);
        }
        while let Ok(x) = tap.pop() {
            analyser.push([x, x]);
            fed = Instant::now();
        }
        // No samples for a while (output closed when idle): read as silence, not
        // the last frame. Not per tick: a device period can be longer than a tick.
        if fed.elapsed() >= STARVED {
            analyser.clear();
        }
        let periodic = last.elapsed() >= REPORT_EVERY;
        if periodic {
            last = Instant::now();
        }
        for i in 0..2 {
            if inner.slots[i].notify.swap(false, Relaxed) || periodic {
                inner.emit_state(i);
            }
        }
        if inner.analysis.load(Relaxed) {
            inner.emit(PlayerEvent::Analysis { bins: analyser.bins().to_vec(), rms: analyser.rms() });
        }
    }
}

// ---------------------------------------------------------------- device thread

enum DevMsg {
    Select(Option<String>),
    /// play(): open the stream if it was stopped for idleness.
    Wake,
    /// Refresh the cached device list.
    Refresh,
    #[cfg(test)]
    Poll(Sender<()>),
}

struct Device {
    inner: Arc<Inner>,
    renderer: Arc<Mutex<Renderer>>,
    out: Box<dyn Output>,
    render: Render,
    selected: Option<String>,
    /// Device the stream is running on.
    current: Option<String>,
    /// A stream should be running: set by play(), cleared after idling.
    wanted: bool,
    idle_after: Duration,
    idle_since: Option<Instant>,
    /// Selected device that failed to open, with the device list it failed
    /// under: not retried until the list changes.
    failed: Option<(String, Vec<String>)>,
}

impl Device {
    fn refresh_list(&mut self) -> Vec<String> {
        let devices = self.out.list_devices();
        *lock(&self.inner.devices) = devices.clone();
        devices
    }

    /// Keep the stream on the selected device, else on the system default,
    /// following default changes and recovering from a lost device.
    fn ensure(&mut self) {
        if !self.wanted {
            return;
        }
        let lost = self.out.lost();
        let default = self.out.default_device();
        let want = match self.selected.clone() {
            // Following the default: no need to enumerate every device.
            None => default.clone(),
            Some(name) => {
                let devices = self.refresh_list();
                let failed = self.failed.as_ref().is_some_and(|(f, d)| *f == name && *d == devices);
                if devices.contains(&name) && !failed {
                    Some(name)
                } else {
                    default.clone()
                }
            }
        };
        for name in [want, default].into_iter().flatten() {
            if !lost && self.current.as_ref() == Some(&name) {
                return;
            }
            // Output::start opens the new stream before dropping the old one,
            // so a failed open leaves the current stream playing.
            match self.out.start(Some(&name), self.render.clone()) {
                Ok(rate) => {
                    self.current = Some(name);
                    self.rate_changed(rate);
                    return;
                }
                Err(e) => {
                    eprintln!("[player] can't open output {name}: {e}");
                    if self.selected.as_ref() == Some(&name) {
                        self.failed = Some((name, lock(&self.inner.devices).clone()));
                    }
                }
            }
        }
        if lost {
            self.out.stop();
            self.current = None;
        }
    }

    /// Close the stream once nothing has played for `idle_after`, so an
    /// open stream doesn't keep Windows from sleeping.
    fn check_idle(&mut self) {
        let active = self.inner.active.load(Relaxed) || self.inner.slots.iter().any(|s| s.playing.load(Relaxed));
        if !self.wanted || active {
            self.idle_since = None;
            return;
        }
        let since = *self.idle_since.get_or_insert_with(Instant::now);
        if since.elapsed() >= self.idle_after {
            self.out.stop();
            self.current = None;
            self.wanted = false;
            self.idle_since = None;
        }
    }

    fn rate_changed(&mut self, rate: u32) {
        if self.inner.out_rate.swap(rate, Relaxed) == rate {
            return;
        }
        // Brief silence while the callback's try_lock fails.
        lock(&self.renderer).set_rate(rate);
        // Re-render loaded slots at the new rate from where they are.
        for i in 0..2 {
            let mut info = lock(&self.inner.slots[i].info);
            if info.loaded {
                let pos = self.inner.position(i, &info);
                self.inner.seek(i, &mut info, pos);
            }
        }
    }

    fn tick(&mut self) {
        self.check_idle();
        self.ensure();
    }

    fn run(mut self, rx: Receiver<DevMsg>) {
        self.refresh_list();
        loop {
            match rx.recv_timeout(DEVICE_POLL) {
                Ok(DevMsg::Select(name)) => {
                    self.selected = name;
                    self.failed = None;
                    self.ensure();
                }
                Ok(DevMsg::Wake) => {
                    self.wanted = true;
                    self.idle_since = None;
                    self.ensure();
                }
                Ok(DevMsg::Refresh) => {
                    self.refresh_list();
                }
                #[cfg(test)]
                Ok(DevMsg::Poll(reply)) => {
                    self.tick();
                    let _ = reply.send(());
                }
                Err(RecvTimeoutError::Timeout) => self.tick(),
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        self.out.stop();
    }
}

// ---------------------------------------------------------------- engine

/// The app's one engine (Tauri state). Slots A and B map onto the web
/// engine's two `<audio>` elements.
pub struct Engine {
    inner: Arc<Inner>,
    #[cfg(test)]
    renderer: Arc<Mutex<Renderer>>,
    dev: Sender<DevMsg>,
}

impl Engine {
    /// `make_output` runs on the device thread (cpal streams are not Send).
    /// No stream is opened until the first play().
    pub fn new(make_output: impl FnOnce() -> Box<dyn Output> + Send + 'static) -> Engine {
        Self::build(make_output, IDLE_STOP)
    }

    fn build(make_output: impl FnOnce() -> Box<dyn Output> + Send + 'static, idle_after: Duration) -> Engine {
        let mut cons = Vec::new();
        let slots = [(); 2].map(|_| {
            let (p, c) = RingBuffer::new(RING_FRAMES);
            cons.push(c);
            SlotShared {
                want_epoch: AtomicU32::new(0),
                playing: AtomicBool::new(false),
                eos_epoch: AtomicU32::new(0),
                pos: AtomicU64::new(0),
                pos_epoch: AtomicU32::new(0),
                ended_epoch: AtomicU32::new(0),
                notify: AtomicBool::new(false),
                info: Mutex::new(Info {
                    generation: 0,
                    loaded: false,
                    loading: false,
                    duration: None,
                    error: None,
                    seek_target: 0.0,
                    speed: 1.0,
                    epoch: 0,
                    ended_reported: 0,
                    load_id: 0,
                    worker: None,
                }),
                producer: Mutex::new(p),
            }
        });
        let (fade_p, fade_c) = RingBuffer::new(256);
        // ~0.4 s of mono at 48 kHz: the reporter drains it every 16 ms.
        let (tap_p, tap_c) = RingBuffer::new(1 << 14);
        let inner = Arc::new(Inner {
            slots,
            fades: Mutex::new(fade_p),
            settings: Mutex::new(Settings::default()),
            settings_dirty: AtomicBool::new(false),
            active: AtomicBool::new(false),
            out_rate: AtomicU32::new(DEFAULT_RATE),
            analysis: AtomicBool::new(false),
            sink: Mutex::new(None),
            shutdown: AtomicBool::new(false),
            reporter: std::sync::OnceLock::new(),
            devices: Mutex::new(Vec::new()),
        });
        let rate = DEFAULT_RATE as f32;
        let mut cons = cons.into_iter();
        let slot = |c: Consumer<Frame>| SlotRender {
            cons: c,
            epoch: 0,
            run: Ramp::new(0.0),
            run_target: 0.0,
            fade: Ramp::new(1.0),
            gain: Ramp::new(1.0),
            pos: 0.0,
            pos_epoch: 0,
            ended_epoch: 0,
        };
        let renderer = Arc::new(Mutex::new(Renderer {
            inner: inner.clone(),
            slots: [slot(cons.next().unwrap()), slot(cons.next().unwrap())],
            fades: fade_c,
            tap: tap_p,
            rate,
            eq: Eq9::new(rate),
            comp: Compressor::new(rate),
            set: Settings::default(),
        }));
        let r = renderer.clone();
        let render: Render = Arc::new(move |buf: &mut [f32], ch| match r.try_lock() {
            Ok(mut r) => r.render(buf, ch),
            Err(_) => buf.fill(0.0),
        });
        let (dev, dev_rx) = mpsc::channel();
        let (di, dr) = (inner.clone(), renderer.clone());
        std::thread::Builder::new()
            .name("player-device".into())
            .spawn(move || {
                let device = Device {
                    inner: di,
                    renderer: dr,
                    out: make_output(),
                    render,
                    selected: None,
                    current: None,
                    wanted: false,
                    idle_after,
                    idle_since: None,
                    failed: None,
                };
                device.run(dev_rx);
            })
            .expect("spawn player-device");
        let ri = inner.clone();
        let reporter = std::thread::Builder::new()
            .name("player-report".into())
            .spawn(move || run_reporter(ri, tap_c))
            .expect("spawn player-report");
        let _ = inner.reporter.set(reporter.thread().clone());
        Engine {
            inner,
            #[cfg(test)]
            renderer,
            dev,
        }
    }

    pub fn subscribe(&self, sink: Sink) {
        *lock(&self.inner.sink) = Some(sink);
    }

    pub fn load(&self, slot: Slot, url: String, start_at: f64, fallback_duration: Option<f64>, generation: u64) {
        let i = slot.idx();
        let s = &self.inner.slots[i];
        let mut info = lock(&s.info);
        info.load_id += 1;
        info.epoch += 1;
        s.want_epoch.store(info.epoch, Relaxed);
        s.playing.store(false, Relaxed);
        info.generation = generation;
        info.loaded = true;
        info.loading = true;
        info.duration = None;
        info.error = None;
        let start_at = if start_at.is_finite() { start_at.max(0.0) } else { 0.0 };
        info.seek_target = start_at;
        let (tx, rx) = mpsc::channel();
        // Dropping the previous sender stops the previous worker.
        info.worker = Some(tx);
        let job = Job {
            url,
            start_at,
            fallback: fallback_duration.filter(|d| d.is_finite() && *d > 0.0),
            epoch: info.epoch,
            load_id: info.load_id,
            speed: info.speed,
        };
        let inner = self.inner.clone();
        if let Err(e) = std::thread::Builder::new()
            .name(format!("player-decode-{i}"))
            .spawn(move || run_worker(inner, i, job, rx))
        {
            eprintln!("[player] can't spawn decoder: {e}");
            info.loading = false;
            info.error = Some(2);
        }
        self.inner.wake(i);
    }

    /// Like `<audio>`, play() after the end starts over.
    pub fn play(&self, slot: Slot) {
        let i = slot.idx();
        let s = &self.inner.slots[i];
        let mut info = lock(&s.info);
        if info.loaded && info.epoch != 0 && s.ended_epoch.load(Relaxed) == info.epoch {
            self.inner.seek(i, &mut info, 0.0);
        }
        s.playing.store(true, Relaxed);
        if let Some(w) = &info.worker {
            let _ = w.send(Ctl::Wake);
        }
        drop(info);
        self.inner.wake(i);
        let _ = self.dev.send(DevMsg::Wake);
    }

    pub fn pause(&self, slot: Slot) {
        self.inner.slots[slot.idx()].playing.store(false, Relaxed);
        self.inner.wake(slot.idx());
    }

    pub fn seek(&self, slot: Slot, seconds: f64) {
        if !seconds.is_finite() {
            return;
        }
        let i = slot.idx();
        let mut info = lock(&self.inner.slots[i].info);
        if info.loaded {
            self.inner.seek(i, &mut info, seconds);
        }
    }

    /// Tempo with pitch kept; today's range is 0.75..4. Applied as an
    /// in-place re-seek at the playing position, so it is heard at once
    /// instead of after the buffered audio.
    pub fn set_speed(&self, slot: Slot, speed: f32) {
        if !speed.is_finite() {
            return;
        }
        let speed = speed.clamp(0.25, 4.0);
        let i = slot.idx();
        let mut info = lock(&self.inner.slots[i].info);
        if info.speed == speed {
            return;
        }
        info.speed = speed;
        if let Some(w) = &info.worker {
            let _ = w.send(Ctl::Speed(speed));
        }
        if info.loaded {
            let pos = self.inner.position(i, &info);
            self.inner.seek(i, &mut info, pos);
        }
    }

    /// Crossfade ramp, multiplied with the slot's gain.
    pub fn fade(&self, slot: Slot, target_gain: f32, seconds: f32, curve: Curve) {
        if target_gain.is_finite() && seconds.is_finite() {
            self.inner.fade(Fade(slot.idx(), target_gain.clamp(0.0, 1.0), seconds.max(0.0), curve));
        }
    }

    /// Linear gain (the volume curve stays in TypeScript); glides 20 ms.
    pub fn set_gain(&self, slot: Slot, gain: f32) {
        if gain.is_finite() {
            self.inner.settings(|s| s.gain[slot.idx()] = gain.clamp(0.0, 1.0));
        }
    }

    pub fn unload(&self, slot: Slot) {
        let s = &self.inner.slots[slot.idx()];
        let mut info = lock(&s.info);
        info.worker = None;
        info.loaded = false;
        info.load_id += 1;
        info.epoch += 1;
        s.want_epoch.store(info.epoch, Relaxed);
        s.playing.store(false, Relaxed);
    }

    pub fn set_eq(&self, enabled: bool, gains_db: [f32; 9]) {
        let gains_db = gains_db.map(|g| if g.is_finite() { g.clamp(-40.0, 40.0) } else { 0.0 });
        self.inner.settings(|s| s.eq = (enabled, gains_db));
    }

    pub fn set_mono(&self, on: bool) {
        self.inner.settings(|s| s.mono = on);
    }

    pub fn set_normalize(&self, on: bool) {
        self.inner.settings(|s| s.normalize = on);
    }

    pub fn set_analysis(&self, enabled: bool) {
        self.inner.analysis.store(enabled, Relaxed);
        if let Some(t) = self.inner.reporter.get() {
            t.unpark();
        }
    }

    /// None follows the system default. Returns at once; the device thread
    /// switches.
    pub fn select_device(&self, name: Option<String>) {
        let _ = self.dev.send(DevMsg::Select(name));
    }

    /// The device thread's last list, refreshed in the background on each
    /// call (and every second while a named device is selected).
    pub fn list_devices(&self) -> Vec<String> {
        let _ = self.dev.send(DevMsg::Refresh);
        lock(&self.inner.devices).clone()
    }

    /// Run the device thread's periodic check now and wait for it.
    #[cfg(test)]
    pub fn poll_device(&self) {
        let (tx, rx) = mpsc::channel();
        if self.dev.send(DevMsg::Poll(tx)).is_ok() {
            let _ = rx.recv();
        }
    }

    #[cfg(test)]
    fn position(&self, i: usize) -> f64 {
        let info = lock(&self.inner.slots[i].info);
        self.inner.position(i, &info)
    }

    #[cfg(test)]
    fn fade_gains(&self) -> (f32, f32) {
        let r = lock(&self.renderer);
        (r.slots[0].fade.value(), r.slots[1].fade.value())
    }

    /// Slot `i` can render `n` frames without underrunning: it is not
    /// playing, has `n` current-epoch frames, or has reached its end.
    #[cfg(test)]
    fn ready(&self, i: usize, n: usize) -> bool {
        let s = &self.inner.slots[i];
        let want = s.want_epoch.load(Relaxed);
        if !s.playing.load(Relaxed) || s.eos_epoch.load(Relaxed) == want {
            return true;
        }
        let mut r = lock(&self.renderer);
        let cons = &mut r.slots[i].cons;
        let Ok(chunk) = cons.read_chunk(cons.slots()) else { return false };
        let (a, b) = chunk.as_slices();
        // Stale frames at the front: only rendering drops them and frees
        // the ring for the worker, so render now.
        a.first().is_some_and(|f| f.epoch < want) || a.iter().chain(b).filter(|f| f.epoch == want).count() >= n
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.inner.shutdown.store(true, Relaxed);
        for s in &self.inner.slots {
            lock(&s.info).worker = None;
        }
    }
}
