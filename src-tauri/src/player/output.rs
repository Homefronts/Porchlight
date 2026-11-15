//! Audio output behind a trait: cpal (WASAPI / ALSA) in the app, a fake that
//! pulls frames on demand in tests.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Fills an interleaved buffer with `channels` channels per frame. Called
/// on the audio thread: must not block or allocate.
pub type Render = Arc<dyn Fn(&mut [f32], usize) + Send + Sync>;

/// Owned by the engine's device thread; nothing else touches it.
pub trait Output {
    /// Open `device` (None = system default), start pulling frames through
    /// `render`, then drop any previous stream. On error the previous stream
    /// keeps running. Returns the sample rate.
    fn start(&mut self, device: Option<&str>, render: Render) -> Result<u32, String>;
    fn stop(&mut self);
    fn list_devices(&self) -> Vec<String>;
    /// Name of the current system default output. Polled by the engine to
    /// follow default changes (cpal has no change notification).
    fn default_device(&self) -> Option<String>;
    /// The running stream has failed (device unplugged or invalidated).
    fn lost(&self) -> bool;
}

pub struct CpalOutput {
    host: cpal::Host,
    stream: Option<cpal::Stream>,
    lost: Arc<AtomicBool>,
}

impl CpalOutput {
    pub fn new() -> Self {
        CpalOutput { host: cpal::default_host(), stream: None, lost: Arc::new(AtomicBool::new(false)) }
    }
}

impl Output for CpalOutput {
    fn start(&mut self, device: Option<&str>, render: Render) -> Result<u32, String> {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
        let dev = match device {
            Some(name) => self
                .host
                .output_devices()
                .map_err(|e| e.to_string())?
                .find(|d| d.name().ok().as_deref() == Some(name)),
            None => self.host.default_output_device(),
        }
        .ok_or("no such output device")?;
        let config = dev.default_output_config().map_err(|e| e.to_string())?.config();
        let channels = config.channels as usize;
        let lost = Arc::new(AtomicBool::new(false));
        let flag = lost.clone();
        // shortcut: always asks for f32 (WASAPI shared mode and ALSA plug take it); add sample-format conversion if a device refuses.
        let stream = dev
            .build_output_stream(
                &config,
                move |buf: &mut [f32], _: &cpal::OutputCallbackInfo| render(buf, channels),
                move |e| {
                    eprintln!("[player] output stream error: {e}");
                    flag.store(true, Ordering::Relaxed);
                },
                None,
            )
            .map_err(|e| e.to_string())?;
        stream.play().map_err(|e| e.to_string())?;
        // Replacing drops the old stream only now that the new one plays.
        self.stream = Some(stream);
        self.lost = lost;
        Ok(config.sample_rate.0)
    }

    fn stop(&mut self) {
        self.stream = None;
    }

    fn list_devices(&self) -> Vec<String> {
        use cpal::traits::{DeviceTrait, HostTrait};
        self.host
            .output_devices()
            .map(|ds| ds.filter_map(|d| d.name().ok()).collect())
            .unwrap_or_default()
    }

    fn default_device(&self) -> Option<String> {
        use cpal::traits::{DeviceTrait, HostTrait};
        self.host.default_output_device().and_then(|d| d.name().ok())
    }

    fn lost(&self) -> bool {
        self.lost.load(Ordering::Relaxed)
    }
}

/// Test output: `pull` runs the render callback for N frames of stereo.
#[cfg(test)]
#[derive(Clone)]
pub struct FakeOutput(Arc<std::sync::Mutex<Fake>>);

#[cfg(test)]
pub struct Fake {
    pub rate: u32,
    pub devices: Vec<String>,
    pub default: String,
    /// Device the stream is open on, None when stopped.
    pub current: Option<String>,
    pub lost: bool,
    /// Devices that are listed but fail to open.
    pub broken: Vec<String>,
    /// Successful start() calls.
    pub starts: usize,
    render: Option<Render>,
}

#[cfg(test)]
impl FakeOutput {
    pub fn new(rate: u32, devices: &[&str]) -> Self {
        FakeOutput(Arc::new(std::sync::Mutex::new(Fake {
            rate,
            devices: devices.iter().map(|s| s.to_string()).collect(),
            default: devices[0].to_string(),
            current: None,
            lost: false,
            broken: Vec::new(),
            starts: 0,
            render: None,
        })))
    }

    pub fn state(&self) -> std::sync::MutexGuard<'_, Fake> {
        self.0.lock().unwrap()
    }

    /// Unplug `name`: it leaves the list and a stream on it fails.
    pub fn unplug(&self, name: &str) {
        let mut f = self.state();
        f.devices.retain(|d| d != name);
        if f.current.as_deref() == Some(name) {
            f.lost = true;
            f.render = None;
        }
    }

    /// Interleaved stereo; silence while no stream is running.
    pub fn pull(&self, frames: usize) -> Vec<f32> {
        let render = self.state().render.clone();
        let mut buf = vec![0.0; frames * 2];
        if let Some(r) = render {
            r(&mut buf, 2);
        }
        buf
    }
}

#[cfg(test)]
impl Output for FakeOutput {
    fn start(&mut self, device: Option<&str>, render: Render) -> Result<u32, String> {
        let mut f = self.state();
        let name = device.map_or(f.default.clone(), str::to_string);
        if !f.devices.contains(&name) || f.broken.contains(&name) {
            return Err("no such output device".into());
        }
        f.current = Some(name);
        f.lost = false;
        f.starts += 1;
        f.render = Some(render);
        Ok(f.rate)
    }

    fn stop(&mut self) {
        let mut f = self.state();
        f.current = None;
        f.render = None;
    }

    fn list_devices(&self) -> Vec<String> {
        self.state().devices.clone()
    }

    fn default_device(&self) -> Option<String> {
        Some(self.state().default.clone())
    }

    fn lost(&self) -> bool {
        self.state().lost
    }
}
