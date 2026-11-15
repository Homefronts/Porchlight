//! Sample-rate conversion plus pitch-preserving time-stretch.
//!
//! Chain: interleaved stereo at `in_rate` -> rubato FFT resampler (skipped
//! when the rates match) -> `out_rate`, then either the dry path (the
//! resampled audio as is, exactly speed 1) or the wet path (`wsola`
//! time-stretch at the playback speed). WSOLA is fed continuously, even while bypassed, so it is always primed.
//! Moving between the paths crossfades over ~17 ms.
//!
//! Runs on the decode worker, not the audio callback. At end of stream the
//! caller (Task 5) must call [`Stretcher::finish`] to flush the tail.

use std::num::{NonZeroU16, NonZeroU32};

use rubato::{FftFixedIn, Resampler};
use wsola::TimeStretch;

const CH: usize = 2;
/// Resampler input chunk, in frames.
const CHUNK: usize = 1024;

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Dry,
    Wet,
}

#[derive(Clone, Copy)]
struct Fade {
    to_dry: bool,
    /// Output frames mixed so far.
    k: usize,
    /// Read position (frames) into `dry`.
    dry_pos: f64,
}

pub struct Stretcher {
    in_rate: u32,
    out_rate: u32,
    resampler: Option<FftFixedIn<f32>>,
    /// Input frames (interleaved) waiting for a full resampler chunk.
    pending: Vec<f32>,
    planar: Vec<Vec<f32>>,
    resampled: Vec<f32>,
    /// Resampler start-up delay still to be dropped from its output.
    skip_left: usize,
    rs_in_frames: u64,
    rs_emitted: u64,

    ts: TimeStretch,
    pull_buf: Vec<f32>,

    /// Dry frames not yet emitted, plus history while on the wet path.
    dry: Vec<f32>,
    /// Source index (resampled domain) of `dry[0]`.
    dry_base: usize,
    /// Total resampled frames fed to wsola.
    pushed: usize,
    /// Wet frames pulled from wsola, not yet emitted.
    wet: Vec<f32>,
    /// Source position after the last pulled wet frame (sum of tempo per frame).
    wet_end_src: f64,

    mode: Mode,
    fade: Option<Fade>,
    started: bool,
    finishing: bool,
}

impl Stretcher {
    pub fn new(in_rate: u32, out_rate: u32) -> Self {
        let resampler = (in_rate != out_rate).then(|| {
            FftFixedIn::new(in_rate as usize, out_rate as usize, CHUNK, 2, CH)
                .expect("valid resampler rates")
        });
        let ts = TimeStretch::new(
            NonZeroU32::new(out_rate).expect("nonzero rate"),
            NonZeroU16::new(CH as u16).unwrap(),
        )
        .expect("wsola config");
        let block = ts.min_output_buff_size();
        let skip_left = resampler.as_ref().map_or(0, |r| r.output_delay());
        Self {
            in_rate,
            out_rate,
            resampler,
            pending: Vec::new(),
            planar: vec![Vec::new(); CH],
            resampled: Vec::new(),
            skip_left,
            rs_in_frames: 0,
            rs_emitted: 0,
            ts,
            pull_buf: vec![0.0; block * 8],
            dry: Vec::new(),
            dry_base: 0,
            pushed: 0,
            wet: Vec::new(),
            wet_end_src: 0.0,
            mode: Mode::Dry,
            fade: None,
            started: false,
            finishing: false,
        }
    }

    /// Tempo multiplier (pitch preserved). Exactly 1.0 bypasses WSOLA;
    /// moving to or from 1.0 crossfades, other changes glide per WSOLA hop.
    pub fn set_speed(&mut self, speed: f32) {
        self.ts.set_tempo(speed);
    }

    /// Feed interleaved stereo input; appends whatever output is ready.
    pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        self.rs_in_frames += (input.len() / CH) as u64;
        let mut rs = std::mem::take(&mut self.resampled);
        rs.clear();
        if self.resampler.is_some() {
            self.pending.extend_from_slice(input);
            self.drain_resampler(&mut rs);
        } else {
            rs.extend_from_slice(input);
        }
        self.ingest(&rs);
        self.resampled = rs;
        self.emit(output);
    }

    /// End of stream: flush the resampler and WSOLA tails into `output` and
    /// reset. Adds at most a few ms beyond the true length.
    pub fn finish(&mut self, output: &mut Vec<f32>) {
        let mut rs = Vec::new();
        if self.resampler.is_some() {
            let target = (self.rs_in_frames * self.out_rate as u64).div_ceil(self.in_rate as u64);
            while self.rs_emitted < target {
                let need = self.resampler.as_ref().unwrap().input_frames_next();
                self.pending.resize(need * CH, 0.0);
                let before = self.rs_emitted;
                self.drain_resampler(&mut rs);
                if self.rs_emitted == before {
                    break;
                }
            }
            let extra = self.rs_emitted.saturating_sub(target) as usize;
            rs.truncate(rs.len() - (extra * CH).min(rs.len()));
        }
        self.ingest(&rs);
        self.ts.set_draining();
        self.pull_wet();
        self.finishing = true;
        self.emit(output);
        if let Some(f) = self.fade.take() {
            self.mode = if f.to_dry { Mode::Dry } else { Mode::Wet };
            if f.to_dry {
                self.wet.clear();
                let d = (f.dry_pos as usize).min(self.dry.len() / CH);
                self.dry.drain(..d * CH);
            }
            self.emit(output);
        }
        self.reset();
    }

    /// Frames of delay between input and output on the active path, in output
    /// frames: 0 for same-rate bypass, measured WSOLA lag when stretching.
    pub fn latency_frames(&self) -> usize {
        let rs_pending = self.resampler.as_ref().map_or(0, |_| {
            (self.pending.len() / CH) * self.out_rate as usize / self.in_rate as usize
        });
        let wet = self.mode == Mode::Wet || self.fade.is_some();
        let lag = if wet {
            ((self.pushed as f64 - self.wet_end_src) / self.ts.tempo() as f64).max(0.0) as usize
        } else {
            0
        };
        rs_pending + lag
    }

    /// Drop buffered audio and stretcher state (after a seek).
    pub fn reset(&mut self) {
        self.pending.clear();
        self.skip_left = self.resampler.as_ref().map_or(0, |r| r.output_delay());
        if let Some(rs) = self.resampler.as_mut() {
            rs.reset();
        }
        self.rs_in_frames = 0;
        self.rs_emitted = 0;
        self.ts.reset();
        self.dry.clear();
        self.dry_base = 0;
        self.pushed = 0;
        self.wet.clear();
        self.wet_end_src = 0.0;
        self.fade = None;
        self.started = false;
        self.finishing = false;
    }

    /// Resample every full pending chunk into `out` (interleaved), dropping
    /// the resampler's start-up delay so its output lines up with the input.
    fn drain_resampler(&mut self, out: &mut Vec<f32>) {
        let Some(rs) = self.resampler.as_mut() else {
            return;
        };
        loop {
            let need = rs.input_frames_next();
            if self.pending.len() < need * CH {
                break;
            }
            for (c, p) in self.planar.iter_mut().enumerate() {
                p.clear();
                p.extend(self.pending[..need * CH].iter().skip(c).step_by(CH));
            }
            self.pending.drain(..need * CH);
            let Ok(res) = rs.process(&self.planar, None) else {
                break;
            };
            let n = res[0].len();
            let skip = self.skip_left.min(n);
            self.skip_left -= skip;
            for i in skip..n {
                for ch in &res {
                    out.push(ch[i]);
                }
            }
            self.rs_emitted += (n - skip) as u64;
        }
    }

    fn ingest(&mut self, rs: &[f32]) {
        self.dry.extend_from_slice(rs);
        self.pushed += rs.len() / CH;
        self.ts.push(rs);
        self.pull_wet();
    }

    fn pull_wet(&mut self) {
        let tempo = self.ts.tempo() as f64;
        // pull() errs with NotEnoughInput once it has nothing more to give.
        while let Ok(n) = self.ts.pull(&mut self.pull_buf) {
            self.wet.extend_from_slice(&self.pull_buf[..n]);
            self.wet_end_src += (n / CH) as f64 * tempo;
            if n < self.pull_buf.len() {
                break;
            }
        }
    }

    /// Source position of the first queued wet frame.
    fn wet_head_src(&self) -> f64 {
        self.wet_end_src - (self.wet.len() / CH) as f64 * self.ts.tempo() as f64
    }

    fn emit(&mut self, out: &mut Vec<f32>) {
        loop {
            if self.fade.is_some() {
                self.run_fade(out);
                if self.fade.is_some() {
                    return;
                }
            }
            let bypass = self.ts.tempo() == 1.0;
            if (self.mode == Mode::Dry) != bypass {
                if self.finishing || !self.started {
                    self.mode = if bypass { Mode::Dry } else { Mode::Wet };
                } else {
                    self.start_fade(bypass);
                    continue;
                }
            }
            if self.mode == Mode::Dry {
                self.started |= !self.dry.is_empty();
                self.dry_base += self.dry.len() / CH;
                out.append(&mut self.dry);
                self.wet.clear();
            } else {
                self.started |= !self.wet.is_empty();
                out.append(&mut self.wet);
                let keep = self.out_rate as usize * CH;
                if self.dry.len() > keep {
                    let cut = self.dry.len() - keep;
                    self.dry.drain(..cut);
                    self.dry_base += cut / CH;
                }
            }
            return;
        }
    }

    fn start_fade(&mut self, to_dry: bool) {
        let mut dry_pos = 0.0;
        if to_dry {
            // Line the dry history up with the wet path's source position.
            let head = self.wet_head_src().round() as isize;
            let off = (head - self.dry_base as isize).clamp(0, (self.dry.len() / CH) as isize);
            self.dry.drain(..off as usize * CH);
            self.dry_base += off as usize;
            dry_pos = 0.0;
        }
        self.fade = Some(Fade { to_dry, k: 0, dry_pos });
    }

    fn run_fade(&mut self, out: &mut Vec<f32>) {
        let Some(mut f) = self.fade else { return };
        let fade_len = (self.out_rate as usize * 17 / 1000).max(1);
        // Returning to 1x: the dry partner is read at the wet speed so the
        // two stay on the same source position through the fade.
        let step = if f.to_dry { self.ts.tempo() as f64 } else { 1.0 };
        let mut wi = 0;
        while f.k < fade_len {
            let di = f.dry_pos as usize;
            if (wi + 1) * CH > self.wet.len() || (di + 1) * CH > self.dry.len() {
                break;
            }
            let a = (f.k as f32 + 0.5) / fade_len as f32;
            let (gd, gw) = if f.to_dry { (a, 1.0 - a) } else { (1.0 - a, a) };
            for c in 0..CH {
                out.push(self.dry[di * CH + c] * gd + self.wet[wi * CH + c] * gw);
            }
            wi += 1;
            f.k += 1;
            f.dry_pos += step;
        }
        self.wet.drain(..wi * CH);
        if f.k >= fade_len {
            self.fade = None;
            self.mode = if f.to_dry { Mode::Dry } else { Mode::Wet };
            if f.to_dry {
                self.wet.clear();
            }
            let d = (f.dry_pos as usize).min(self.dry.len() / CH);
            self.dry.drain(..d * CH);
            self.dry_base += d;
        } else {
            self.fade = Some(f);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustfft::{num_complex::Complex, FftPlanner};

    fn tone_hz(rate: u32, secs: f32, amp: f32, l: f32, r: f32) -> Vec<f32> {
        let n = (rate as f32 * secs) as usize;
        let w = |f: f32, i: usize| amp * (2.0 * std::f32::consts::PI * f * i as f32 / rate as f32).sin();
        (0..n).flat_map(|i| [w(l, i), w(r, i)]).collect()
    }

    fn tone(rate: u32, secs: f32, amp: f32) -> Vec<f32> {
        tone_hz(rate, secs, amp, 440.0, 440.0)
    }

    fn run(st: &mut Stretcher, input: &[f32]) -> Vec<f32> {
        let mut out = Vec::new();
        for c in input.chunks(2048) {
            st.process(c, &mut out);
        }
        st.finish(&mut out);
        out
    }

    /// Peak frequency of one channel, away from the start-up transient.
    fn peak_hz(out: &[f32], rate: u32, ch: usize) -> f32 {
        let n = 16384;
        let start = (out.len() / 2 / 2).min(out.len() / 2 - n) * 2;
        let mut buf: Vec<Complex<f32>> = (0..n)
            .map(|i| {
                let w = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos();
                Complex::new(out[start + i * 2 + ch] * w, 0.0)
            })
            .collect();
        FftPlanner::new().plan_fft_forward(n).process(&mut buf);
        let k = (1..n / 2)
            .max_by(|&a, &b| buf[a].norm().total_cmp(&buf[b].norm()))
            .unwrap();
        k as f32 * rate as f32 / n as f32
    }

    #[test]
    fn same_rate_1x_is_bit_exact() {
        let mut st = Stretcher::new(48_000, 48_000);
        let input = tone(48_000, 1.0, 0.5);
        let mut out = Vec::new();
        for c in input.chunks(1000) {
            st.process(c, &mut out);
            assert_eq!(st.latency_frames(), 0);
        }
        assert_eq!(out, input);
        st.finish(&mut out);
        assert_eq!(out, input);
    }

    #[test]
    fn resamples_48k_to_44k1_at_speed_1() {
        let mut st = Stretcher::new(48_000, 44_100);
        let input = tone(48_000, 5.0, 0.5);
        let out = run(&mut st, &input);
        let want = input.len() / 2 * 44_100 / 48_000;
        let got = out.len() / 2;
        assert!(want.abs_diff(got) <= 220, "{got} vs {want}");
        assert!((peak_hz(&out, 44_100, 0) - 440.0).abs() < 5.0);
    }

    #[test]
    fn stretches_and_keeps_pitch() {
        for (rin, speed) in [(48_000, 0.75f32), (48_000, 1.5), (44_100, 1.5), (48_000, 4.0)] {
            let mut st = Stretcher::new(rin, 48_000);
            st.set_speed(speed);
            let input = tone(rin, 10.0, 0.5);
            let out = run(&mut st, &input);
            let want = input.len() as f32 / 2.0 * (48_000.0 / rin as f32) / speed;
            let got = out.len() as f32 / 2.0;
            assert!((got - want).abs() / want < 0.01, "speed {speed}: {got} vs {want}");
            assert!((peak_hz(&out, 48_000, 0) - 440.0).abs() < 5.0, "speed {speed}");
        }
    }

    #[test]
    fn channels_keep_their_own_pitch() {
        let mut st = Stretcher::new(48_000, 48_000);
        st.set_speed(1.5);
        let out = run(&mut st, &tone_hz(48_000, 6.0, 0.5, 440.0, 660.0));
        assert!((peak_hz(&out, 48_000, 0) - 440.0).abs() < 5.0);
        assert!((peak_hz(&out, 48_000, 1) - 660.0).abs() < 5.0);
    }

    #[test]
    fn switching_through_1x_does_not_click() {
        let mut st = Stretcher::new(48_000, 48_000);
        // 100 Hz at 0.5: a real waveform step is at most ~0.0065.
        let input = tone_hz(48_000, 6.0, 0.5, 100.0, 100.0);
        let mut out = Vec::new();
        let mut want = 0.0;
        for (i, c) in input.chunks(1024).enumerate() {
            let s = if (20..60).contains(&i) { 1.5 } else { 1.0 };
            st.set_speed(s);
            st.process(c, &mut out);
            want += c.len() as f32 / 2.0 / s;
        }
        st.finish(&mut out);
        let got = out.len() as f32 / 2.0;
        // Each switch repeats or skips up to one WSOLA lag (~40 ms).
        assert!((got - want).abs() < 3000.0, "{got} vs {want}");
        let max_step = out
            .chunks(2)
            .zip(out.chunks(2).skip(1))
            .map(|(a, b)| (a[0] - b[0]).abs())
            .fold(0.0, f32::max);
        assert!(max_step < 0.03, "max step {max_step}");
        assert!(out.iter().all(|s| s.abs() <= 0.5 + 1e-3));
    }

    #[test]
    fn speed_change_mid_stream_stays_bounded() {
        let mut st = Stretcher::new(44_100, 48_000);
        let input = tone(44_100, 6.0, 0.5);
        let mut out = Vec::new();
        for (i, c) in input.chunks(2048).enumerate() {
            st.set_speed([1.0, 4.0, 0.75, 1.5, 1.0][i % 5]);
            st.process(c, &mut out);
        }
        assert!(!out.is_empty());
        assert!(out.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
    }

    #[test]
    fn reset_drops_buffered_audio() {
        for speed in [1.0, 1.5] {
            let mut st = Stretcher::new(48_000, 44_100);
            st.set_speed(speed);
            let mut out = Vec::new();
            st.process(&tone(48_000, 0.5, 0.5), &mut out);
            assert!(!out.is_empty());
            st.reset();
            out.clear();
            st.process(&[], &mut out);
            st.finish(&mut out);
            assert!(out.is_empty(), "speed {speed}: {} samples", out.len());
        }
    }
}
