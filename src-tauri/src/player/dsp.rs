//! The DSP stages of the native player, replicating the
//! WebAudio chain the app used before (the removed `src/lib/audio-graph.ts`):
//! 9-band EQ -> mono -> compressor, plus ramps.
//!
//! Everything here runs inside the audio callback: no allocation, no locks.

use std::f64::consts::PI;

/// Band centres in Hz; mirrors `EQ_BANDS` in `src/lib/store/playback-settings.ts`.
pub const EQ_BANDS: [f32; 9] = [
    62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];
const PEAK_Q: f64 = 1.2;
/// Same time constant as the WebAudio graph's `setTargetAtTime(.., 0.02)`.
const EQ_SMOOTH_SEC: f32 = 0.02;

fn db_to_gain(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

/// One-pole smoothing factor reaching ~63% of a step in `seconds`.
fn one_pole(seconds: f32, sample_rate: f32) -> f32 {
    1.0 - (-1.0 / (seconds * sample_rate)).exp()
}

#[derive(Clone, Copy)]
enum Shape {
    LowShelf,
    Peaking,
    HighShelf,
}

/// RBJ cookbook biquad in transposed direct form II, coefficients
/// normalised by a0; the formulas are the ones Chromium's `Biquad` uses
/// (shelf slope S = 1).
#[derive(Clone, Copy)]
struct Biquad {
    shape: Shape,
    /// sin and cos of the band's normalised frequency, fixed per band.
    sin: f64,
    cos: f64,
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    /// Per-channel state `[z1, z2]`.
    z: [[f64; 2]; 2],
}

impl Biquad {
    fn new(shape: Shape, hz: f32, sample_rate: f32) -> Self {
        // Keep the 16 kHz band below Nyquist at low device rates.
        let w0 = 2.0 * PI * (hz.min(sample_rate * 0.49) / sample_rate) as f64;
        let mut f = Biquad {
            shape,
            sin: w0.sin(),
            cos: w0.cos(),
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            z: [[0.0; 2]; 2],
        };
        f.set_gain(0.0);
        f
    }

    fn set_gain(&mut self, gain_db: f32) {
        let a = 10f64.powf(gain_db as f64 / 40.0);
        let (sin, k) = (self.sin, self.cos);
        let (b0, b1, b2, a0, a1, a2) = match self.shape {
            Shape::Peaking => {
                let alpha = sin / (2.0 * PEAK_Q);
                (
                    1.0 + alpha * a,
                    -2.0 * k,
                    1.0 - alpha * a,
                    1.0 + alpha / a,
                    -2.0 * k,
                    1.0 - alpha / a,
                )
            }
            Shape::LowShelf => {
                let k2 = a.sqrt() * sin * std::f64::consts::SQRT_2;
                let (ap, am) = (a + 1.0, a - 1.0);
                (
                    a * (ap - am * k + k2),
                    2.0 * a * (am - ap * k),
                    a * (ap - am * k - k2),
                    ap + am * k + k2,
                    -2.0 * (am + ap * k),
                    ap + am * k - k2,
                )
            }
            Shape::HighShelf => {
                let k2 = a.sqrt() * sin * std::f64::consts::SQRT_2;
                let (ap, am) = (a + 1.0, a - 1.0);
                (
                    a * (ap + am * k + k2),
                    -2.0 * a * (am + ap * k),
                    a * (ap + am * k - k2),
                    ap - am * k + k2,
                    2.0 * (am - ap * k),
                    ap - am * k - k2,
                )
            }
        };
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[inline]
    fn process(&mut self, ch: usize, x: f64) -> f64 {
        let z = &mut self.z[ch];
        let y = self.b0 * x + z[0];
        z[0] = self.b1 * x - self.a1 * y + z[1];
        z[1] = self.b2 * x - self.a2 * y;
        y
    }
}

/// The nine-band equaliser: band 0 a low shelf, band 8 a high shelf, the
/// rest peaks at Q 1.2, with the input pre-attenuated by the largest boost
/// so a +10 dB band cannot clip a full-scale track.
pub struct Eq9 {
    filters: [Biquad; 9],
    gains: [f32; 9],
    targets: [f32; 9],
    pre: f32,
    pre_target: f32,
    enabled: bool,
    /// Gains and pre-gain have reached their targets.
    settled: bool,
    smooth: f32,
}

impl Eq9 {
    pub fn new(sample_rate: f32) -> Self {
        let shape = |i| match i {
            0 => Shape::LowShelf,
            8 => Shape::HighShelf,
            _ => Shape::Peaking,
        };
        Eq9 {
            filters: std::array::from_fn(|i| Biquad::new(shape(i), EQ_BANDS[i], sample_rate)),
            gains: [0.0; 9],
            targets: [0.0; 9],
            pre: 1.0,
            pre_target: 1.0,
            enabled: false,
            settled: true,
            smooth: one_pole(EQ_SMOOTH_SEC, sample_rate),
        }
    }

    /// Apply a curve, or glide every band back to flat when disabled.
    pub fn set(&mut self, enabled: bool, gains_db: [f32; 9]) {
        self.enabled = enabled;
        self.targets = if enabled { gains_db } else { [0.0; 9] };
        let max_boost = self.targets.iter().fold(0f32, |m, &g| m.max(g));
        self.pre_target = db_to_gain(-max_boost);
        self.settled = false;
    }

    /// Advance every gain one sample towards its target, recomputing the
    /// coefficients each sample so the curve moves without steps.
    fn glide(&mut self) {
        let s = self.smooth;
        self.pre += (self.pre_target - self.pre) * s;
        // Relative (~0.001 dB): an f32 one-pole stalls ~1e-4 short of 1.0.
        let mut done = (self.pre - self.pre_target).abs() < 1e-4 * self.pre_target;
        for ((f, g), &t) in self
            .filters
            .iter_mut()
            .zip(&mut self.gains)
            .zip(&self.targets)
        {
            if *g == t {
                continue;
            }
            *g += (t - *g) * s;
            if (t - *g).abs() < 1e-3 {
                *g = t;
            } else {
                done = false;
            }
            f.set_gain(*g);
        }
        if done {
            self.pre = self.pre_target;
            self.settled = true;
            if !self.enabled {
                // Entering bypass: stale state would click on the next enable.
                for f in &mut self.filters {
                    f.z = [[0.0; 2]; 2];
                }
            }
        }
    }

    pub fn process(&mut self, frame: &mut [f32; 2]) {
        if !self.settled {
            self.glide();
        } else if !self.enabled {
            // Off and back at flat: leave the samples untouched.
            return;
        }
        for (ch, s) in frame.iter_mut().enumerate() {
            let mut x = (*s * self.pre) as f64;
            for f in &mut self.filters {
                x = f.process(ch, x);
            }
            *s = x as f32;
        }
    }
}

/// Fold stereo down to mono on both channels.
pub fn fold_mono(frame: &mut [f32; 2]) {
    let m = (frame[0] + frame[1]) * 0.5;
    *frame = [m, m];
}

const COMP_THRESHOLD_DB: f64 = -24.0;
const COMP_KNEE_DB: f64 = 30.0;
const COMP_RATIO: f64 = 12.0;
const COMP_ATTACK_SEC: f32 = 0.003;
const COMP_RELEASE_SEC: f32 = 0.25;

fn lin_to_db(x: f64) -> f64 {
    20.0 * x.log10()
}

fn db_to_lin(db: f64) -> f64 {
    10f64.powf(db / 20.0)
}

/// The static curve of Chromium's `DynamicsCompressorKernel`: linear below
/// the threshold, an exponential soft knee, then `1/ratio` above the knee.
#[derive(Clone, Copy)]
struct StaticCurve {
    linear_threshold: f64,
    linear_knee_threshold: f64,
    knee_threshold_db: f64,
    y_knee_threshold_db: f64,
    k: f64,
}

impl StaticCurve {
    fn knee(&self, x: f64, k: f64) -> f64 {
        self.linear_threshold + (1.0 - (-k * (x - self.linear_threshold)).exp()) / k
    }

    fn slope_at(&self, x: f64, k: f64) -> f64 {
        if x < self.linear_threshold {
            return 1.0;
        }
        let x2 = x * 1.001;
        let (xdb, x2db) = (lin_to_db(x), lin_to_db(x2));
        let (ydb, y2db) = (lin_to_db(self.knee(x, k)), lin_to_db(self.knee(x2, k)));
        (y2db - ydb) / (x2db - xdb)
    }

    fn new() -> Self {
        let knee_threshold_db = COMP_THRESHOLD_DB + COMP_KNEE_DB;
        let mut c = StaticCurve {
            linear_threshold: db_to_lin(COMP_THRESHOLD_DB),
            linear_knee_threshold: db_to_lin(knee_threshold_db),
            knee_threshold_db,
            y_knee_threshold_db: 0.0,
            k: 5.0,
        };
        // Chromium's k_at_slope: the knee steepness whose slope at the knee's
        // top equals 1/ratio, by geometric bisection.
        let (mut lo, mut hi) = (0.1f64, 10_000.0f64);
        for _ in 0..15 {
            if c.slope_at(c.linear_knee_threshold, c.k) < 1.0 / COMP_RATIO {
                hi = c.k;
            } else {
                lo = c.k;
            }
            c.k = (lo * hi).sqrt();
        }
        c.y_knee_threshold_db = lin_to_db(c.knee(c.linear_knee_threshold, c.k));
        c
    }

    fn saturate(&self, x: f64) -> f64 {
        if x < self.linear_threshold {
            x
        } else if x < self.linear_knee_threshold {
            self.knee(x, self.k)
        } else {
            let db =
                self.y_knee_threshold_db + (lin_to_db(x) - self.knee_threshold_db) / COMP_RATIO;
            db_to_lin(db)
        }
    }
}

/// Loudness levelling as the WebAudio graph does it: a DynamicsCompressor
/// at threshold -24 dB, knee 30, ratio 12, attack 3 ms, release 250 ms,
/// with WebAudio's automatic make-up gain. No look-ahead.
pub struct Compressor {
    curve: StaticCurve,
    makeup: f32,
    attack: f32,
    release: f32,
    /// Smoothed gain reduction in dB (<= 0).
    gain_db: f32,
}

impl Compressor {
    pub fn new(sample_rate: f32) -> Self {
        let curve = StaticCurve::new();
        let full_range_gain = curve.saturate(1.0);
        Compressor {
            curve,
            makeup: (1.0 / full_range_gain).powf(0.6) as f32,
            attack: one_pole(COMP_ATTACK_SEC, sample_rate),
            release: one_pole(COMP_RELEASE_SEC, sample_rate),
            gain_db: 0.0,
        }
    }

    pub fn process(&mut self, frame: &mut [f32; 2]) {
        let level = frame[0].abs().max(frame[1].abs()) as f64;
        let target = if level > self.curve.linear_threshold {
            lin_to_db(self.curve.saturate(level) / level) as f32
        } else {
            0.0
        };
        let rate = if target < self.gain_db {
            self.attack
        } else {
            self.release
        };
        self.gain_db += (target - self.gain_db) * rate;
        let g = db_to_gain(self.gain_db) * self.makeup;
        frame[0] *= g;
        frame[1] *= g;
    }
}

/// Serialized camelCase: "linear", "equalPowerIn", "equalPowerOut".
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Curve {
    Linear,
    /// sin(t*pi/2) shape from 0 to 1. Both equal-power names move power by
    /// sin^2 and behave the same; the two names read better at call sites.
    EqualPowerIn,
    /// cos(t*pi/2) shape when ramping 1 -> 0.
    EqualPowerOut,
}

/// A per-sample gain ramp from the current value to a target.
pub struct Ramp {
    value: f32,
    start: f32,
    target: f32,
    i: u32,
    n: u32,
    curve: Curve,
}

impl Ramp {
    pub fn new(value: f32) -> Self {
        Ramp {
            value,
            start: value,
            target: value,
            i: 0,
            n: 0,
            curve: Curve::Linear,
        }
    }

    /// Start ramping from wherever the value is now.
    pub fn to(&mut self, target: f32, seconds: f32, sample_rate: f32, curve: Curve) {
        self.start = self.value;
        self.target = target;
        self.curve = curve;
        self.i = 0;
        self.n = (seconds * sample_rate).round().max(0.0) as u32;
        if self.n == 0 {
            self.value = target;
        }
    }

    pub fn next(&mut self) -> f32 {
        if self.i < self.n {
            self.i += 1;
            self.value = if self.i == self.n {
                self.target
            } else {
                let t = self.i as f32 / self.n as f32;
                let half_pi = std::f32::consts::FRAC_PI_2;
                match self.curve {
                    Curve::Linear => self.start + (self.target - self.start) * t,
                    // Power moves by sin^2: from 0/1 this is exactly sin/cos,
                    // and any pair started together from unit power stays
                    // at unit power, so a fade reversed mid-way is seamless.
                    Curve::EqualPowerIn | Curve::EqualPowerOut => {
                        let w = (t * half_pi).sin().powi(2);
                        let (p0, p1) = (self.start * self.start, self.target * self.target);
                        (p0 + (p1 - p0) * w).max(0.0).sqrt()
                    }
                }
            };
        }
        self.value
    }

    #[cfg(test)]
    pub fn is_done(&self) -> bool {
        self.i >= self.n
    }

    pub fn value(&self) -> f32 {
        self.value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    const SR: f32 = 48_000.0;

    fn db(x: f32) -> f32 {
        20.0 * x.log10()
    }

    /// Gain in dB a stage applies to a stereo sine of `hz` at `amp`, measured
    /// as RMS over the last half of two seconds.
    fn measure(hz: f32, amp: f32, mut stage: impl FnMut(&mut [f32; 2])) -> f32 {
        let n = (SR * 2.0) as usize;
        let (mut sum_in, mut sum_out) = (0.0f64, 0.0f64);
        for i in 0..n {
            let x = amp * (2.0 * PI * hz * i as f32 / SR).sin();
            let mut f = [x, x];
            stage(&mut f);
            if i >= n / 2 {
                sum_in += (x as f64).powi(2);
                sum_out += (f[0] as f64).powi(2);
            }
        }
        db((sum_out / sum_in).sqrt() as f32)
    }

    #[test]
    fn eq_disabled_is_bit_transparent() {
        let mut eq = Eq9::new(SR);
        eq.set(false, [10.0, 8.0, 5.0, 2.0, 0.0, -1.0, -1.0, 0.0, 0.0]);
        for i in 0..10_000 {
            let x = (i as f32 * 0.01).sin() * 0.7;
            let mut f = [x, -x * 0.5];
            eq.process(&mut f);
            assert_eq!(f, [x, -x * 0.5]);
        }
        // Switched off from a live curve, it glides back to an exact bypass.
        eq.set(true, [6.0; 9]);
        for _ in 0..4800 {
            eq.process(&mut [0.3, 0.3]);
        }
        eq.set(false, [6.0; 9]);
        for _ in 0..(SR as usize) {
            eq.process(&mut [0.3, 0.3]);
        }
        let mut f = [0.25, -0.5];
        eq.process(&mut f);
        assert_eq!(f, [0.25, -0.5]);
    }

    #[test]
    fn eq_flat_is_transparent() {
        for hz in [62.0, 1000.0, 10_000.0] {
            let mut eq = Eq9::new(SR);
            eq.set(true, [0.0; 9]);
            let g = measure(hz, 0.5, |f| eq.process(f));
            assert!(g.abs() < 0.01, "{hz} Hz: {g} dB");
        }
    }

    fn eq_gain(gains: [f32; 9], hz: f32) -> f32 {
        let mut eq = Eq9::new(SR);
        eq.set(true, gains);
        measure(hz, 0.1, |f| eq.process(f))
    }

    #[test]
    fn eq_bands_have_the_webaudio_shapes() {
        let mut shelf = [0.0; 9];
        shelf[0] = 10.0;
        // Deep in the low shelf: the full +10, paid back by the -10 pre-gain.
        let g = eq_gain(shelf, 20.0);
        assert!(g.abs() < 0.5, "shelf at 20 Hz: {g} dB");
        // An RBJ shelf (S = 1) gives exactly half its gain at its corner.
        let g = eq_gain(shelf, 62.0);
        assert!((g + 5.0).abs() < 0.1, "shelf at 62 Hz: {g} dB");
        let mut high = [0.0; 9];
        high[8] = 6.0;
        let g = eq_gain(high, 16000.0);
        assert!((g + 3.0).abs() < 0.1, "high shelf at 16 kHz: {g} dB");
        let mut peak = [0.0; 9];
        peak[4] = 6.0;
        // A peak has its full gain at its centre and almost none 4 octaves out.
        let g = eq_gain(peak, 1000.0);
        assert!(g.abs() < 0.05, "peak at 1 kHz: {g} dB");
        let g = eq_gain(peak, 62.0);
        assert!((g + 6.0).abs() < 0.1, "peak at 62 Hz: {g} dB");
        // Cuts don't pre-attenuate.
        peak[4] = -6.0;
        let g = eq_gain(peak, 1000.0);
        assert!((g + 6.0).abs() < 0.05, "cut at 1 kHz: {g} dB");
    }

    #[test]
    fn eq_bass_preset_levels() {
        let bass = [10.0, 8.0, 5.0, 2.0, 0.0, -1.0, -1.0, 0.0, 0.0];
        // At 62 Hz: shelf +5 (its corner) plus the skirts of the 125 Hz and
        // 250 Hz peaks, less the 10 dB pre-attenuation: what WebAudio plays.
        let low = eq_gain(bass, 62.0);
        assert!((low + 2.8).abs() < 1.0, "62 Hz: {low} dB");
        // Deep bass gets the whole boost back.
        let sub = eq_gain(bass, 30.0);
        assert!(sub.abs() < 1.0, "30 Hz: {sub} dB");
        let mid = eq_gain(bass, 1000.0);
        assert!((mid + 10.0).abs() < 1.0, "1 kHz: {mid} dB");
    }

    #[test]
    fn eq_change_has_no_zipper_step() {
        // A sudden +12 dB on a band must not jump the output between samples.
        let mut eq = Eq9::new(SR);
        eq.set(true, [0.0; 9]);
        let mut prev = 0.0f32;
        let mut worst = 0.0f32;
        for i in 0..(SR as usize) {
            if i == 4800 {
                eq.set(true, [12.0; 9]);
            }
            let x = 0.5 * (2.0 * PI * 100.0 * i as f32 / SR).sin();
            let mut f = [x, x];
            eq.process(&mut f);
            if i > 0 {
                worst = worst.max((f[0] - prev).abs());
            }
            prev = f[0];
        }
        // A 100 Hz sine at 0.5 moves at most ~0.0066 per sample.
        assert!(worst < 0.02, "largest step {worst}");
    }

    #[test]
    fn fold_mono_averages() {
        let mut f = [1.0, 0.0];
        fold_mono(&mut f);
        assert_eq!(f, [0.5, 0.5]);
    }

    /// Peak output level in dB per quarter second over the second second.
    fn compressed_peaks(amp: f32) -> [f32; 4] {
        let mut c = Compressor::new(SR);
        let n = (SR * 2.0) as usize;
        let mut peaks = [0.0f32; 4];
        for i in 0..n {
            let x = amp * (2.0 * PI * 440.0 * i as f32 / SR).sin();
            let mut f = [x, x];
            c.process(&mut f);
            if i >= n / 2 {
                let q = (i - n / 2) * 4 / (n / 2);
                peaks[q] = peaks[q].max(f[0].abs());
            }
        }
        peaks.map(db)
    }

    fn quiet_gain() -> f32 {
        let mut c = Compressor::new(SR);
        measure(440.0, 0.001, |f| c.process(f))
    }

    #[test]
    fn compressor_reduces_loud_sine_stably() {
        // -6 dBFS is pulled well down against the quiet (make-up only) path.
        // With WebAudio's +3.7 dB make-up its net is still a little above
        // the input, exactly as the WebAudio node behaves.
        let quiet = quiet_gain();
        let p = compressed_peaks(0.5);
        for q in p {
            assert!(
                q - db(0.5) < quiet - 2.0,
                "-6 dBFS peak {q} dB, quiet {quiet}"
            );
            assert!((q - p[0]).abs() < 0.1, "unstable {p:?}");
        }
        // Full scale comes out below its input.
        let p = compressed_peaks(1.0);
        for q in p {
            assert!(q < -1.0, "0 dBFS peak {q} dB");
            assert!((q - p[0]).abs() < 0.1, "unstable {p:?}");
        }
    }

    #[test]
    fn compressor_lifts_quiet_sine() {
        // (1 / fullRangeGain)^0.6 for these settings.
        let g = quiet_gain();
        assert!((g - 3.66).abs() < 0.1, "{g} dB");
    }

    #[test]
    fn equal_power_ramps_sum_to_unit_power() {
        let mut a = Ramp::new(0.0);
        let mut b = Ramp::new(1.0);
        a.to(1.0, 0.5, SR, Curve::EqualPowerIn);
        b.to(0.0, 0.5, SR, Curve::EqualPowerOut);
        while !a.is_done() {
            let (x, y) = (a.next(), b.next());
            assert!((x * x + y * y - 1.0).abs() < 1e-4, "{x} {y}");
        }
        assert!(b.is_done());
        assert_eq!((a.next(), b.next()), (1.0, 0.0));
    }

    #[test]
    fn equal_power_reversed_mid_fade_keeps_unit_power() {
        let mut a = Ramp::new(0.0);
        let mut b = Ramp::new(1.0);
        a.to(1.0, 0.5, SR, Curve::EqualPowerIn);
        b.to(0.0, 0.5, SR, Curve::EqualPowerOut);
        for _ in 0..7000 {
            a.next();
            b.next();
        }
        // The user skips back mid-fade: both curves restart from where they are.
        a.to(0.0, 0.5, SR, Curve::EqualPowerOut);
        b.to(1.0, 0.5, SR, Curve::EqualPowerIn);
        while !a.is_done() {
            let (x, y) = (a.next(), b.next());
            assert!((x * x + y * y - 1.0).abs() < 1e-3, "{x} {y}");
        }
        assert_eq!((a.value(), b.value()), (0.0, 1.0));
    }

    #[test]
    fn linear_ramp_hits_target_exactly() {
        let mut r = Ramp::new(0.3);
        r.to(0.9, 0.01, SR, Curve::Linear);
        let mut last = 0.0;
        for _ in 0..480 {
            last = r.next();
        }
        assert!(r.is_done());
        assert_eq!(last, 0.9);
        assert_eq!(r.next(), 0.9);
    }
}
