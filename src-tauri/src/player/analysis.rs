//! Analysis tap: replicates WebAudio's AnalyserNode.getByteFrequencyData
//! (fftSize 512, smoothing 0.65, -100..-30 dB) for the visualizer, and gives
//! Skip Silences its 512-sample RMS.

use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;

const N: usize = 512;
const BINS: usize = N / 2;
const SMOOTHING: f32 = 0.65;
const MIN_DB: f32 = -100.0;
const MAX_DB: f32 = -30.0;

pub struct Analyser {
    ring: [f32; N],
    pos: usize,
    window: [f32; N],
    smoothed: [f32; BINS],
    fft: Arc<dyn Fft<f32>>,
    buf: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
}

impl Analyser {
    pub fn new() -> Self {
        let fft = FftPlanner::<f32>::new().plan_fft_forward(N);
        let scratch = vec![Complex::new(0.0, 0.0); fft.get_inplace_scratch_len()];
        let mut window = [0.0; N];
        for (n, w) in window.iter_mut().enumerate() {
            let p = n as f32 / N as f32 * std::f32::consts::TAU;
            // Blackman, alpha 0.16
            *w = 0.42 - 0.5 * p.cos() + 0.08 * (2.0 * p).cos();
        }
        Self {
            ring: [0.0; N],
            pos: 0,
            window,
            smoothed: [0.0; BINS],
            fft,
            buf: vec![Complex::new(0.0, 0.0); N],
            scratch,
        }
    }

    /// Real-time safe: no allocation, no locks.
    pub fn push(&mut self, frame: [f32; 2]) {
        self.ring[self.pos] = (frame[0] + frame[1]) * 0.5;
        self.pos = (self.pos + 1) % N;
    }

    pub fn bins(&mut self) -> [u8; BINS] {
        for i in 0..N {
            let x = self.ring[(self.pos + i) % N] * self.window[i];
            self.buf[i] = Complex::new(x, 0.0);
        }
        self.fft.process_with_scratch(&mut self.buf, &mut self.scratch);
        let mut out = [0u8; BINS];
        for k in 0..BINS {
            let mag = self.buf[k].norm() / N as f32;
            let s = SMOOTHING * self.smoothed[k] + (1.0 - SMOOTHING) * mag;
            self.smoothed[k] = s;
            let db = 20.0 * s.log10(); // -inf for silence, clamps to 0
            out[k] = (255.0 * (db - MIN_DB) / (MAX_DB - MIN_DB)).clamp(0.0, 255.0) as u8;
        }
        out
    }

    /// Nothing is playing: the window goes silent, so bins decay through the
    /// smoothing (as WebAudio's do) and rms reads 0.
    pub fn clear(&mut self) {
        self.ring = [0.0; N];
    }

    /// RMS of the last 512 mono samples.
    pub fn rms(&self) -> f32 {
        (self.ring.iter().map(|x| x * x).sum::<f32>() / N as f32).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_sine(a: &mut Analyser, amp: f32, n: usize) {
        for i in 0..n {
            let v = amp * (std::f32::consts::TAU * 1000.0 * i as f32 / 48000.0).sin();
            a.push([v, v]);
        }
    }

    fn settle(a: &mut Analyser) -> [u8; BINS] {
        let mut b = [0u8; BINS];
        for _ in 0..40 {
            b = a.bins();
        }
        b
    }

    fn peak(b: &[u8; BINS]) -> usize {
        (0..BINS).max_by_key(|&k| b[k]).unwrap()
    }

    #[test]
    fn clear_silences_and_bins_decay() {
        let mut a = Analyser::new();
        feed_sine(&mut a, 10f32.powf(-50.0 / 20.0), N);
        let k = peak(&settle(&mut a));
        a.clear();
        assert_eq!(a.rms(), 0.0);
        let first = a.bins()[k];
        assert!(first > 0, "decays, does not snap");
        assert_eq!(settle(&mut a)[k], 0);
    }

    #[test]
    fn silence_is_zero() {
        let mut a = Analyser::new();
        for _ in 0..N {
            a.push([0.0, 0.0]);
        }
        assert!(a.bins().iter().all(|&b| b == 0));
        assert_eq!(a.rms(), 0.0);
    }

    #[test]
    fn full_scale_sine_peaks_at_1khz() {
        let mut a = Analyser::new();
        feed_sine(&mut a, 1.0, N);
        let b = settle(&mut a);
        let expect = (1000.0f32 / (48000.0 / 512.0)).round() as i32;
        assert!((peak(&b) as i32 - expect).abs() <= 1);
        assert_eq!(b[peak(&b)], 255);
        assert!((a.rms() - 0.707).abs() < 0.01);
    }

    #[test]
    fn quiet_sine_matches_db_mapping() {
        let mut a = Analyser::new();
        feed_sine(&mut a, 10f32.powf(-70.0 / 20.0), N);
        let b = settle(&mut a);
        // peak magnitude = amp * 0.21 (Blackman coherent gain 0.42 / 2)
        let db = -70.0 + 20.0 * 0.21f32.log10();
        let expect = 255.0 * (db - MIN_DB) / (MAX_DB - MIN_DB);
        let got = b[peak(&b)] as f32;
        assert!(got > 0.0 && got < 255.0 && (got - expect).abs() <= 8.0, "{got} vs {expect}");
    }

    #[test]
    fn peak_decays_geometrically() {
        let mut a = Analyser::new();
        // quiet enough that the byte is not clamped at 255
        feed_sine(&mut a, 10f32.powf(-50.0 / 20.0), N);
        let k = peak(&settle(&mut a));
        for _ in 0..N {
            a.push([0.0, 0.0]);
        }
        let b1 = a.bins()[k] as f32;
        let b2 = a.bins()[k] as f32;
        // each call multiplies linear magnitude by 0.65 = -3.74 dB = ~13.7 bytes
        let step = 20.0 * (1.0f32 / SMOOTHING).log10() / (MAX_DB - MIN_DB) * 255.0;
        assert!(b1 > 0.0 && b2 > 0.0 && b1 < 255.0);
        assert!(((b1 - b2) - step).abs() <= 1.5, "{b1} {b2} {step}");
    }
}
