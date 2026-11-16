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
    rig_idle(Duration::from_secs(10))
}

fn rig_idle(idle_after: Duration) -> Rig {
    let out = FakeOutput::new(RATE, &["Speakers", "USB DAC"]);
    let o = out.clone();
    let engine = Engine::build(move || Box::new(o), idle_after);
    engine.poll_device();
    let events = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    engine.subscribe(Box::new(move |e| {
        ev.lock().unwrap().push(e);
        true
    }));
    Rig { engine, out, events }
}

impl Rig {
    /// play(), then wait until the device thread has (re)opened the stream.
    fn play(&self, slot: Slot) {
        self.engine.play(slot);
        self.engine.poll_device();
    }

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
    r.play(Slot::A);
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
    r.play(Slot::A);
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
    r.play(Slot::A);
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
    r.play(Slot::A);
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
    r.play(Slot::A);
    assert!(peak(&r.pull(0.1)) > 0.05);
    assert!(r.engine.position(0) < 0.2);
}

#[test]
fn reload_drops_reports_of_the_old_generation() {
    let r = rig();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    r.pull(0.2);
    r.engine.seek(Slot::A, 2.0);
    r.load(Slot::A, 2);
    let mark = r.states(Slot::A).len();
    r.play(Slot::A);
    r.pull(0.3);
    std::thread::sleep(Duration::from_millis(600));
    let after = &r.states(Slot::A)[mark..];
    assert!(!after.is_empty());
    assert!(after.iter().all(|s| s.0 == 2), "{after:?}");
}

#[test]
fn equal_power_crossfade_keeps_unit_power_even_when_reversed() {
    // B runs a quarter period of 440 Hz (27 frames) behind A, so the two
    // tones are in quadrature: the mix's amplitude is sqrt(a^2 + b^2) of one
    // tone, i.e. it measures power the way uncorrelated music would.
    let r = rig();
    r.load(Slot::A, 1);
    r.engine.load(Slot::B, fixture("tone440-3s.webm"), 27.0 / RATE as f64, None, 1);
    r.wait_loaded(Slot::A);
    r.wait_loaded(Slot::B);
    r.engine.fade(Slot::B, 0.0, 0.0, Curve::Linear);
    r.play(Slot::A);
    r.play(Slot::B);
    let one = peak(&r.pull(0.1)[RATE as usize / 20 * 2..]);
    r.engine.fade(Slot::A, 0.0, 1.0, Curve::EqualPowerOut);
    r.engine.fade(Slot::B, 1.0, 1.0, Curve::EqualPowerIn);
    for k in 0..150 {
        if k == 40 {
            // Skip back mid-fade.
            r.engine.fade(Slot::A, 1.0, 1.0, Curve::EqualPowerIn);
            r.engine.fade(Slot::B, 0.0, 1.0, Curve::EqualPowerOut);
        }
        let level = peak(&r.pull(CHUNK as f64 / RATE as f64)) / one;
        assert!((level - 1.0).abs() < 0.03, "{k}: level {level}");
    }
    assert_eq!(r.engine.fade_gains(), (1.0, 0.0));
}

#[test]
fn slots_progress_at_their_own_speed() {
    let r = rig();
    r.load(Slot::A, 1);
    r.load(Slot::B, 1);
    r.engine.set_speed(Slot::B, 4.0);
    r.wait_loaded(Slot::A);
    r.wait_loaded(Slot::B);
    r.play(Slot::A);
    r.play(Slot::B);
    r.pull(0.5);
    let (a, b) = (r.engine.position(0), r.engine.position(1));
    assert!((a - 0.5).abs() < 0.05, "A {a}");
    assert!((b - 2.0).abs() < 0.15, "B {b}");
}

#[test]
fn lost_device_falls_back_to_default_and_keeps_playing() {
    let r = rig();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    assert_eq!(r.out.state().current.as_deref(), Some("Speakers"));
    assert!(peak(&r.pull(0.2)) > 0.05);
    // A device at another rate: playback carries on from the same spot.
    r.out.state().rate = 44100;
    r.engine.select_device(Some("USB DAC".into()));
    r.engine.poll_device();
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
    r.load(Slot::A, 1);
    r.play(Slot::A);
    assert_eq!(r.out.state().current.as_deref(), Some("Speakers"));
    r.out.state().default = "USB DAC".into();
    r.engine.poll_device();
    assert_eq!(r.out.state().current.as_deref(), Some("USB DAC"));
    assert_eq!(r.engine.list_devices(), vec!["Speakers", "USB DAC"]);
}

#[test]
fn unopenable_device_falls_back_once_and_is_not_retried() {
    let r = rig();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    r.out.state().broken = vec!["USB DAC".into()];
    r.engine.select_device(Some("USB DAC".into()));
    r.engine.poll_device();
    assert_eq!(r.out.state().current.as_deref(), Some("Speakers"));
    let starts = r.out.state().starts;
    for _ in 0..3 {
        r.engine.poll_device();
    }
    assert_eq!(r.out.state().starts, starts, "reopened the stream");
    assert!(peak(&r.pull(0.1)) > 0.05);
    // A change in the device list allows a new attempt.
    r.out.state().broken.clear();
    r.out.state().devices.push("HDMI".into());
    r.engine.poll_device();
    assert_eq!(r.out.state().current.as_deref(), Some("USB DAC"));
}

#[test]
fn idle_output_closes_and_reopens_on_play() {
    let r = rig_idle(Duration::from_millis(50));
    r.load(Slot::A, 1);
    r.play(Slot::A);
    assert!(peak(&r.pull(0.1)) > 0.05);
    r.engine.pause(Slot::A);
    r.pull(0.02);
    r.engine.poll_device(); // starts the idle clock
    std::thread::sleep(Duration::from_millis(80));
    r.engine.poll_device();
    assert_eq!(r.out.state().current, None, "stream still open");
    r.play(Slot::A);
    assert_eq!(r.out.state().current.as_deref(), Some("Speakers"));
    assert!(peak(&r.pull(0.1)) > 0.05);
}

#[test]
fn settings_changed_while_stopped_apply_on_start() {
    let r = rig();
    // More changes than any command queue would hold while nothing renders.
    for k in 0..1000 {
        r.engine.set_gain(Slot::A, k as f32 / 1000.0);
    }
    r.engine.set_eq(true, [-40.0; 9]);
    r.engine.set_gain(Slot::A, 0.5);
    r.load(Slot::A, 1);
    r.play(Slot::A);
    let out = r.pull(0.3);
    assert!(peak(&out[RATE as usize / 5 * 2..]) < 0.005, "EQ not applied");
    r.engine.set_eq(false, [0.0; 9]);
    let out = r.pull(0.3);
    // EQ off again, gain 0.5 of the ~0.09 tone.
    let p = peak(&out[RATE as usize / 5 * 2..]);
    assert!((p - 0.045).abs() < 0.008, "{p}");
}

#[test]
fn speed_change_is_heard_at_once() {
    let r = rig();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    r.pull(0.2);
    // Let the worker fill the whole ring: the buffered audio must not delay it.
    std::thread::sleep(Duration::from_millis(50));
    r.engine.set_speed(Slot::A, 4.0);
    r.pull(0.03);
    let p1 = r.engine.position(0);
    r.pull(0.1);
    let p2 = r.engine.position(0);
    assert!((p2 - p1 - 0.4).abs() < 0.06, "advanced {}", p2 - p1);
    assert!((p1 - 0.2).abs() < 0.15, "{p1}");
}

/// Largest sample-to-sample step on the left channel.
fn max_step(x: &[f32]) -> f32 {
    x.windows(3).step_by(2).map(|w| (w[2] - w[0]).abs()).fold(0f32, f32::max)
}

/// A slot renderer fed straight from a ring (no engine, no threads).
fn bare_slot() -> (super::SlotRender, rtrb::Producer<super::Frame>) {
    let (p, c) = rtrb::RingBuffer::new(super::RING_FRAMES);
    (super::SlotRender::new(c), p)
}

fn feed(p: &mut rtrb::Producer<super::Frame>, n: usize, v: f32) {
    for _ in 0..n {
        p.push(super::Frame { s: [v, v], pos: 0.0, epoch: 1 }).unwrap();
    }
}

fn render(slot: &mut super::SlotRender, eos: u32, n: usize) -> Vec<f32> {
    let mut l = super::Live { want: 1, playing: true, eos, ended: false };
    (0..n).map(|_| slot.next(&mut l, RATE as f32)[0]).collect()
}

#[test]
fn a_panic_while_rendering_does_not_silence_the_engine_for_good() {
    let r = rig();
    let renderer = r.engine.renderer.clone();
    let _ = std::thread::spawn(move || {
        let _g = renderer.lock().unwrap();
        panic!("poison the renderer");
    })
    .join();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    assert!(peak(&r.pull(0.2)) > 0.05, "silent after a poisoned lock");
}

#[test]
fn running_dry_ramps_out_instead_of_cutting() {
    let (mut slot, mut p) = bare_slot();
    feed(&mut p, 4000, 0.5); // DC: the worst case for a cut
    let out = render(&mut slot, 0, 6000);
    let step = out.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0f32, f32::max);
    assert!(step < 0.01, "step {step}");
    assert_eq!(*out.last().unwrap(), 0.0);
}

#[test]
fn ramp_in_waits_for_enough_frames() {
    let (mut slot, mut p) = bare_slot();
    feed(&mut p, 100, 0.5);
    assert_eq!(peak(&render(&mut slot, 0, 200)), 0.0, "started on 100 frames");
    feed(&mut p, 2000, 0.5);
    assert!(peak(&render(&mut slot, 0, 400)) > 0.4);
    // At the end of the stream, a short tail plays without waiting.
    let (mut slot, mut p) = bare_slot();
    feed(&mut p, 100, 0.5);
    assert!(peak(&render(&mut slot, 1, 100)) > 0.0);
}

#[test]
fn seek_and_load_while_playing_do_not_click() {
    let r = rig();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    let mut out = r.pull(0.2);
    let p = peak(&out);
    r.engine.seek(Slot::A, 1.5);
    out.extend(r.pull(0.2));
    r.load(Slot::A, 2);
    r.play(Slot::A);
    out.extend(r.pull(0.2));
    assert!(max_step(&out) < 0.1 * p, "step {} peak {p}", max_step(&out));
}

#[test]
fn unload_ramps_to_silence() {
    let r = rig();
    r.load(Slot::A, 1);
    r.play(Slot::A);
    let mut out = r.pull(0.2);
    let p = peak(&out);
    r.engine.unload(Slot::A);
    let after = r.pull(0.05);
    assert_eq!(peak(&after[RATE as usize / 100 * 2..]), 0.0);
    out.extend(after);
    assert!(max_step(&out) < 0.1 * p);
}

#[test]
fn missing_file_reports_network_error() {
    let r = rig();
    r.engine.load(Slot::A, fixture("missing.webm"), 0.0, None, 1);
    assert!(r.wait_for(|e| matches!(e,
        PlayerEvent::State { slot: Slot::A, loading: false, error_code: Some(2), .. })));
}

#[test]
fn start_at_is_honoured() {
    let r = rig();
    r.engine.load(Slot::A, fixture("tone440-3s.webm"), 2.0, None, 1);
    assert!(r.wait_for(|e| matches!(e,
        PlayerEvent::State { slot: Slot::A, position, .. } if *position == 2.0)));
    r.play(Slot::A);
    assert!(peak(&r.pull(0.1)) > 0.05);
    let p = r.engine.position(0);
    assert!((p - 2.1).abs() < 0.02, "{p}");
}

#[test]
fn analysis_frames_stop_when_disabled() {
    let r = rig();
    let count = || r.events.lock().unwrap().iter().filter(|e| matches!(e, PlayerEvent::Analysis { .. })).count();
    r.load(Slot::A, 1);
    r.play(Slot::A);
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

#[test]
fn analysis_goes_quiet_once_paused_and_decayed() {
    let r = rig();
    let analysis = || -> Vec<(Vec<u8>, f32)> {
        r.events.lock().unwrap().iter().filter_map(|e| match e {
            PlayerEvent::Analysis { bins, rms } => Some((bins.clone(), *rms)),
            _ => None,
        }).collect()
    };
    r.engine.set_analysis(true);
    r.load(Slot::A, 1);
    r.play(Slot::A);
    r.pull(0.2);
    r.engine.pause(Slot::A);
    r.pull(0.05);
    // Starved (nothing pulls), the analyser clears and the bins decay.
    std::thread::sleep(Duration::from_millis(800));
    let quiet = analysis();
    let (bins, rms) = quiet.last().unwrap();
    assert!(*rms == 0.0 && bins.iter().all(|&b| b == 0), "last frame not silent");
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(analysis().len(), quiet.len(), "still sending while idle");
    r.play(Slot::A);
    r.pull(0.1);
    std::thread::sleep(Duration::from_millis(100));
    assert!(analysis().len() > quiet.len() + 3, "did not resume on play");
}
