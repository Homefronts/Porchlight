//! Sample-rate conversion plus pitch-preserving time-stretch.
//!
//! Chain: interleaved stereo at `in_rate` -> rubato FFT resampler -> `out_rate`
//! -> WSOLA (`wsola` crate, pure Rust) at the playback speed. The stretcher is
//! always in the chain, including at 1x: WSOLA at tempo 1.0 reconstructs the
//! input, and staying in the chain makes speed changes seamless (no bypass
//! switch to click on). Runs on the decode worker, not the audio callback.

use std::num::{NonZeroU16, NonZeroU32};

use rubato::{FftFixedIn, Resampler};
use wsola::TimeStretch;

const CH: usize = 2;
/// Resampler input chunk, in frames.
const CHUNK: usize = 1024;

pub struct Stretcher {
    resampler: Option<FftFixedIn<f32>>,
    /// Input frames (interleaved) waiting for a full resampler chunk.
    pending: Vec<f32>,
    /// Scratch: planar resampler input and resampled interleaved output.
    planar: Vec<Vec<f32>>,
    resampled: Vec<f32>,
    ts: TimeStretch,
    /// Scratch for `TimeStretch::pull` (a multiple of its hop block).
    pull_buf: Vec<f32>,
    out_rate: u32,
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
        Self {
            resampler,
            pending: Vec::new(),
            planar: vec![Vec::new(); CH],
            resampled: Vec::new(),
            ts,
            pull_buf: vec![0.0; block * 8],
            out_rate,
        }
    }

    /// Tempo multiplier (pitch preserved). WSOLA applies it per synthesis
    /// hop, so a change glides in over a few tens of milliseconds.
    pub fn set_speed(&mut self, speed: f32) {
        self.ts.set_tempo(speed);
    }

    /// Feed interleaved stereo input; appends whatever output is ready.
    pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        match self.resampler.as_mut() {
            None => self.ts.push(input),
            Some(rs) => {
                self.pending.extend_from_slice(input);
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
                    let Ok(out) = rs.process(&self.planar, None) else {
                        break;
                    };
                    self.resampled.clear();
                    for i in 0..out[0].len() {
                        for ch in &out {
                            self.resampled.push(ch[i]);
                        }
                    }
                    self.ts.push(&self.resampled);
                }
            }
        }
        // pull() errs with NotEnoughInput once it has nothing more to give.
        while let Ok(n) = self.ts.pull(&mut self.pull_buf) {
            output.extend_from_slice(&self.pull_buf[..n]);
            if n < self.pull_buf.len() {
                break;
            }
        }
    }

    /// Output frames of delay through the chain at 1x.
    pub fn latency_frames(&self) -> usize {
        let rs = self.resampler.as_ref().map_or(0, |r| r.output_delay());
        rs + self.ts.min_output_buff_size() / CH * 2
    }

    /// Drop buffered audio and stretcher state (after a seek).
    pub fn reset(&mut self) {
        self.pending.clear();
        if let Some(rs) = self.resampler.as_mut() {
            rs.reset();
        }
        self.ts.reset();
    }

    #[allow(dead_code)]
    pub fn out_rate(&self) -> u32 {
        self.out_rate
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustfft::{num_complex::Complex, FftPlanner};

    fn tone(rate: u32, secs: f32, amp: f32) -> Vec<f32> {
        let n = (rate as f32 * secs) as usize;
        (0..n)
            .flat_map(|i| {
                let s = amp * (2.0 * std::f32::consts::PI * 440.0 * i as f32 / rate as f32).sin();
                [s, s]
            })
            .collect()
    }

    fn run(st: &mut Stretcher, input: &[f32]) -> Vec<f32> {
        let mut out = Vec::new();
        for c in input.chunks(2048) {
            st.process(c, &mut out);
        }
        out
    }

    /// Peak frequency of the left channel (skipping the start-up transient).
    fn peak_hz(out: &[f32], rate: u32) -> f32 {
        let n = 16384;
        let start = (out.len() / 2 / 2).min(out.len() / 2 - n) * 2;
        let mut buf: Vec<Complex<f32>> = (0..n)
            .map(|i| {
                let w = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos();
                Complex::new(out[start + i * 2] * w, 0.0)
            })
            .collect();
        FftPlanner::new().plan_fft_forward(n).process(&mut buf);
        let k = (1..n / 2)
            .max_by(|&a, &b| buf[a].norm().total_cmp(&buf[b].norm()))
            .unwrap();
        k as f32 * rate as f32 / n as f32
    }

    #[test]
    fn resamples_48k_to_44k1_at_speed_1() {
        let mut st = Stretcher::new(48_000, 44_100);
        let input = tone(48_000, 5.0, 0.5);
        let out = run(&mut st, &input);
        let want = input.len() / 2 * 44_100 / 48_000;
        let got = out.len() / 2;
        assert!(want.abs_diff(got) <= st.latency_frames() + 2048, "{got} vs {want}");
        assert!((peak_hz(&out, 44_100) - 440.0).abs() < 5.0);
    }

    #[test]
    fn stretches_and_keeps_pitch() {
        for speed in [0.75f32, 1.5, 4.0] {
            let mut st = Stretcher::new(48_000, 48_000);
            st.set_speed(speed);
            let input = tone(48_000, 10.0, 0.5);
            let out = run(&mut st, &input);
            let want = input.len() as f32 / 2.0 / speed;
            let got = out.len() as f32 / 2.0;
            assert!((got - want).abs() / want < 0.02, "speed {speed}: {got} vs {want}");
            assert!((peak_hz(&out, 48_000) - 440.0).abs() < 5.0, "speed {speed}");
        }
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
        let mut st = Stretcher::new(48_000, 44_100);
        let mut out = Vec::new();
        st.process(&tone(48_000, 0.01, 0.5), &mut out);
        st.reset();
        out.clear();
        st.process(&[], &mut out);
        assert!(out.is_empty());
    }
}
