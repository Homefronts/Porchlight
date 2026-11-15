//! Engine tests: FakeOutput pulls frames, fixtures come through a file source.

use super::dsp::Curve;
use super::output::FakeOutput;
use super::{Engine, PlayerEvent, Slot};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const RATE: u32 = 48000;
const CHUNK: usize = 480;

struct Rig {
    engine: Engine,
    out: FakeOutput,
    events: Arc<Mutex<Vec<PlayerEvent>>>,
}

fn fixture(name: &str) -> String {
    format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))
}

fn rig() -> Rig {
    let out = FakeOutput::new(RATE, &["Speakers", "USB DAC"]);
    let o = out.clone();
    let engine = Engine::new(move || Box::new(o));
    engine.poll_device();
    let events = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    engine.subscribe(Box::new(move |e| ev.lock().unwrap().push(e)));
    Rig { engine, out, events }
}

impl Rig {
    fn load(&self, slot: Slot, generation: u64) {
        self.engine.load(slot, fixture("tone440-3s.webm"), 0.0, None, generation);
    }

    /// Pull `secs` of output in 10 ms chunks, waiting before each chunk until
    /// every playing slot has a chunk buffered (or has reached its end), so
    /// a slow worker cannot underrun the test.
    fn pull(&self, secs: f64) -> Vec<f32> {
        let mut all = Vec::new();
        for _ in 0..(secs * RATE as f64 / CHUNK as f64).round() as usize {
            let t = Instant::now();
            while !(0..2).all(|i| self.engine.ready(i, CHUNK)) {
                assert!(t.elapsed() < Duration::from_secs(5), "worker underrun");
                std::thread::sleep(Duration::from_millis(1));
            }
            all.extend(self.out.pull(CHUNK));
        }
        all
    }

    /// Wait up to 3 s for an event matching `pred`.
    fn wait_for(&self, pred: impl Fn(&PlayerEvent) -> bool) -> bool {
        let t = Instant::now();
        while t.elapsed() < Duration::from_secs(3) {
            if self.events.lock().unwrap().iter().any(&pred) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        false
    }

    fn states(&self, slot: Slot) -> Vec<(u64, f64, bool, bool)> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|e| match e {
                PlayerEvent::State { slot: s, generation, position, playing, ended, .. } if *s == slot => {
                    Some((*generation, *position, *playing, *ended))
                }
                _ => None,
            })
            .collect()
    }

    fn wait_loaded(&self, slot: Slot) {
        assert!(self.wait_for(|e| matches!(e,
            PlayerEvent::State { slot: s, loading: false, duration: Some(_), .. } if *s == slot)));
    }
}

fn peak(x: &[f32]) -> f32 {
    x.iter().fold(0f32, |m, v| m.max(v.abs()))
}

#[test]
fn load_and_play_outputs_audio_and_reports_generation() {
    let r = rig();
    r.load(Slot::A, 7);
    r.engine.play(Slot::A);
    let out = r.pull(0.5);
    assert!(peak(&out) > 0.05, "silent output");
    assert!(r.wait_for(|e| matches!(e,
        PlayerEvent::State { slot: Slot::A, generation: 7, playing: true, position, duration: Some(d), .. }
            if *position > 0.3 && (*d - 3.0).abs() < 0.05)));
}

#[test]
fn pause_ramps_to_silence_without_a_click() {
    let r = rig();
    r.load(Slot::A, 1);
    r.engine.play(Slot::A);
    let before = r.pull(0.3);
    let p = peak(&before);
    r.engine.pause(Slot::A);
    let after = r.pull(0.1);
    // Silence after 10 ms of ramp.
    assert_eq!(peak(&after[RATE as usize / 100 * 2..]), 0.0);
    // No step bigger than a 440 Hz sine's own slope allows (~0.06 of peak).
    let mut joined = before[before.len() - 2..].to_vec();
    joined.extend_from_slice(&after);
    let jump = joined.windows(3).step_by(2).map(|w| (w[2] - w[0]).abs()).fold(0f32, f32::max);
    assert!(jump < 0.1 * p, "jump {jump} peak {p}");
}

#[test]
fn seek_reports_new_position() {
    let r = rig();
    r.load(Slot::A, 1);
    r.engine.play(Slot::A);
    r.pull(0.2);
    r.engine.seek(Slot::A, 1.0);
    assert!(r.wait_for(|e| matches!(e,
        PlayerEvent::State { slot: Slot::A, position, .. } if (*position - 1.0).abs() < 0.02)));
    r.pull(0.1);
    let p = r.engine.position(0);
    assert!((p - 1.1).abs() < 0.03, "{p}");
}

#[test]
fn seek_past_end_reports_ended_once() {
    let r = rig();
    r.load(Slot::A, 1);
    r.engine.play(Slot::A);
    r.pull(0.1);
    r.engine.seek(Slot::A, 10.0);
    for _ in 0..10 {
        r.pull(0.05);
        std::thread::sleep(Duration::from_millis(60));
    }
    let ended: Vec<_> = r.states(Slot::A).into_iter().filter(|s| s.3).collect();
    assert_eq!(ended.len(), 1, "{ended:?}");
    assert!((ended[0].1 - 3.0).abs() < 0.05 && !ended[0].2, "{ended:?}");
    // Like <audio>: play() after the end starts over.
    r.engine.play(Slot::A);
    assert!(peak(&r.pull(0.1)) > 0.05);
    assert!(r.engine.position(0) < 0.2);
}

#[test]
fn reload_drops_reports_of_the_old_generation() {
    let r = rig();
    r.load(Slot::A, 1);
    r.engine.play(Slot::A);
    r.pull(0.2);
    r.engine.seek(Slot::A, 2.0);
    r.load(Slot::A, 2);
    let mark = r.states(Slot::A).len();
    r.engine.play(Slot::A);
    r.pull(0.3);
    std::thread::sleep(Duration::from_millis(600));
    let after = &r.states(Slot::A)[mark..];
    assert!(!after.is_empty());
    assert!(after.iter().all(|s| s.0 == 2), "{after:?}");
}

#[test]
fn equal_power_crossfade_keeps_unit_power_even_when_reversed() {
    let r = rig();
    r.load(Slot::A, 1);
    r.load(Slot::B, 1);
    r.engine.fade(Slot::B, 0.0, 0.0, Curve::Linear);
    r.engine.play(Slot::A);
    r.engine.play(Slot::B);
    r.pull(0.05);
    r.engine.fade(Slot::A, 0.0, 1.0, Curve::EqualPowerOut);
    r.engine.fade(Slot::B, 1.0, 1.0, Curve::EqualPowerIn);
    let mut last = (1.0, 0.0);
    for k in 0..150 {
        if k == 40 {
            // Skip back mid-fade.
            r.engine.fade(Slot::A, 1.0, 1.0, Curve::EqualPowerIn);
            r.engine.fade(Slot::B, 0.0, 1.0, Curve::EqualPowerOut);
        }
        r.out.pull(CHUNK);
        let (a, b) = r.engine.fade_gains();
        assert!((a * a + b * b - 1.0).abs() < 0.01, "{k}: {a} {b}");
        assert!((a - last.0).abs() < 0.05 && (b - last.1).abs() < 0.05, "{k}: jump");
        last = (a, b);
    }
    assert_eq!(last, (1.0, 0.0));
}

#[test]
fn slots_progress_at_their_own_speed() {
    let r = rig();
    r.load(Slot::A, 1);
    r.load(Slot::B, 1);
    r.engine.set_speed(Slot::B, 4.0);
    r.wait_loaded(Slot::A);
    r.wait_loaded(Slot::B);
    r.engine.play(Slot::A);
    r.engine.play(Slot::B);
    r.pull(0.5);
    let (a, b) = (r.engine.position(0), r.engine.position(1));
    assert!((a - 0.5).abs() < 0.05, "A {a}");
    assert!((b - 2.0).abs() < 0.15, "B {b}");
}

#[test]
fn lost_device_falls_back_to_default_and_keeps_playing() {
    let r = rig();
    assert_eq!(r.out.state().current.as_deref(), Some("Speakers"));
    r.load(Slot::A, 1);
    r.engine.play(Slot::A);
    assert!(peak(&r.pull(0.2)) > 0.05);
    // A device at another rate: playback carries on from the same spot.
    r.out.state().rate = 44100;
    r.engine.select_device(Some("USB DAC".into()));
    assert_eq!(r.out.state().current.as_deref(), Some("USB DAC"));
    // `pull` counts 48 kHz chunks: 0.2 s of chunks is 0.218 s at 44.1 kHz.
    assert!(peak(&r.pull(0.2)) > 0.05);
    r.out.unplug("USB DAC");
    r.engine.poll_device();
    assert_eq!(r.out.state().current.as_deref(), Some("Speakers"));
    assert!(peak(&r.pull(0.2)) > 0.05);
    let p = r.engine.position(0);
    assert!((p - 0.636).abs() < 0.03, "{p}");
}

#[test]
fn default_device_change_is_followed() {
    let r = rig();
    r.out.state().default = "USB DAC".into();
    r.engine.poll_device();
    assert_eq!(r.out.state().current.as_deref(), Some("USB DAC"));
    assert_eq!(r.engine.list_devices(), vec!["Speakers", "USB DAC"]);
}

#[test]
fn analysis_frames_stop_when_disabled() {
    let r = rig();
    let count = || r.events.lock().unwrap().iter().filter(|e| matches!(e, PlayerEvent::Analysis { .. })).count();
    r.load(Slot::A, 1);
    r.engine.play(Slot::A);
    r.engine.set_analysis(true);
    r.pull(0.2);
    std::thread::sleep(Duration::from_millis(200));
    assert!(count() > 3);
    assert!(r.events.lock().unwrap().iter().any(|e| matches!(e,
        PlayerEvent::Analysis { bins, rms } if *rms > 0.01 && bins.iter().any(|&b| b > 0))));
    r.engine.set_analysis(false);
    std::thread::sleep(Duration::from_millis(50));
    let n = count();
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(count(), n);
}
