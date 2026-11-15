//! Demux (Symphonia: WebM/MKV, MP4) and decode (Symphonia AAC, libopus for
//! Opus) to interleaved stereo f32. Runs on the decode worker, not the audio
//! callback, so it may allocate.

use super::source::MediaError;
use std::io::ErrorKind;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL, CODEC_TYPE_OPUS};
use symphonia::core::errors::{Error as SymError, SeekErrorKind};
use symphonia::core::formats::{FormatOptions, FormatReader, Packet, SeekMode, SeekTo};
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{Time, TimeBase};

/// Decode this much before a seek target so the codec state has converged
/// (Opus needs 80 ms; also covers AAC's MDCT overlap).
const PREROLL: f64 = 0.08;
/// Largest Opus packet: 120 ms at 48 kHz.
const OPUS_MAX_FRAMES: usize = 5760;
/// This many undecodable packets in a row (about 1 s) fail the stream.
const MAX_SKIPPED_RUN: u32 = 50;

enum Codec {
    Symphonia(Box<dyn symphonia::core::codecs::Decoder>, Option<SampleBuffer<f32>>),
    Opus(opus::Decoder),
}

pub struct Decoder {
    format: Box<dyn FormatReader>,
    codec: Codec,
    track_id: u32,
    time_base: TimeBase,
    rate: u32,
    /// Leading decoded frames that are not audio (the Opus pre-skip).
    delay: u64,
    duration: Option<f64>,
    /// Frame index (true timeline) just after the last frame returned.
    pos: u64,
    /// Output before this frame index is dropped (seek target).
    discard_to: u64,
    eof: bool,
    /// Packets decoded and skipped as undecodable since open, and the
    /// current run of skipped ones.
    decoded: u64,
    skipped: u64,
    skipped_run: u32,
    /// Interleaved stereo scratch for one packet.
    pcm: Vec<f32>,
}

fn media_err(e: SymError) -> MediaError {
    match e {
        SymError::IoError(e) => MediaError::Network(e.to_string()),
        SymError::Unsupported(m) => MediaError::Unsupported(m.into()),
        e => MediaError::Decode(e.to_string()),
    }
}

fn is_eof(e: &SymError) -> bool {
    matches!(e, SymError::IoError(e) if e.kind() == ErrorKind::UnexpectedEof)
}

fn seconds(t: Time) -> f64 {
    t.seconds as f64 + t.frac
}

impl Decoder {
    pub fn open(source: Box<dyn MediaSource>, fallback_duration: Option<f64>) -> Result<Self, MediaError> {
        let mss = MediaSourceStream::new(source, Default::default());
        // No hint: files are named .webm whatever the container.
        let format = symphonia::default::get_probe()
            .format(&Hint::new(), mss, &FormatOptions::default(), &MetadataOptions::default())
            .map_err(|e| match e {
                SymError::IoError(e) if e.kind() != ErrorKind::UnexpectedEof => MediaError::Network(e.to_string()),
                e => MediaError::Unsupported(e.to_string()),
            })?
            .format;
        let codecs = symphonia::default::get_codecs();
        // First track we can decode (skips video, subtitles, unknown codecs).
        let track = format
            .tracks()
            .iter()
            .find(|t| {
                let c = t.codec_params.codec;
                c != CODEC_TYPE_NULL && (c == CODEC_TYPE_OPUS || codecs.get_codec(c).is_some())
            })
            .ok_or_else(|| MediaError::Unsupported("no decodable audio track".into()))?;
        let params = &track.codec_params;
        let (codec, rate, delay) = if params.codec == CODEC_TYPE_OPUS {
            // OpusHead: magic(8) version(1) channels(1) pre_skip(u16 LE) ...
            let delay = match params.extra_data.as_deref() {
                Some(h) if h.len() >= 12 && h.starts_with(b"OpusHead") => u16::from_le_bytes([h[10], h[11]]) as u64,
                _ => 0,
            };
            // libopus always decodes at 48 kHz and up/downmixes to stereo itself.
            let dec = opus::Decoder::new(48000, opus::Channels::Stereo).map_err(|e| MediaError::Decode(e.to_string()))?;
            (Codec::Opus(dec), 48000, delay)
        } else {
            let dec = codecs
                .make(params, &DecoderOptions::default())
                .map_err(media_err)?;
            let rate = params.sample_rate.ok_or_else(|| MediaError::Unsupported("no sample rate".into()))?;
            // shortcut: AAC encoder priming (~23 ms) and Opus end padding are not trimmed; add gapless trim if track joins click.
            (Codec::Symphonia(dec, None), rate, 0)
        };
        let time_base = params.time_base.unwrap_or_else(|| TimeBase::new(1, rate));
        let duration = params
            .n_frames
            .map(|n| seconds(time_base.calc_time(n)) - delay as f64 / rate as f64)
            .filter(|d| *d > 0.0)
            .or(fallback_duration);
        let track_id = track.id;
        Ok(Self {
            format,
            codec,
            track_id,
            time_base,
            rate,
            delay,
            duration,
            pos: 0,
            discard_to: 0,
            eof: false,
            decoded: 0,
            skipped: 0,
            skipped_run: 0,
            pcm: Vec::new(),
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.rate
    }

    #[cfg(test)]
    /// Always 2: output is stereo whatever the source.
    pub fn channels(&self) -> usize {
        2
    }

    /// Container duration, else the fallback given to `open`.
    pub fn duration(&self) -> Option<f64> {
        self.duration
    }

    /// Seconds, just after the last frame returned by `next_frames`.
    pub fn position(&self) -> f64 {
        self.pos as f64 / self.rate as f64
    }

    /// Replaces `out` with the next chunk of interleaved stereo frames.
    /// Returns false (and leaves `out` empty) at end of stream.
    pub fn next_frames(&mut self, out: &mut Vec<f32>) -> Result<bool, MediaError> {
        out.clear();
        while !self.eof {
            let packet = match self.format.next_packet() {
                Ok(p) => p,
                // ResetRequired = a new chained stream; treat it as the end.
                Err(e) if is_eof(&e) || matches!(e, SymError::ResetRequired) => {
                    self.eof = true;
                    break;
                }
                Err(e) => return Err(media_err(e)),
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            match self.decode_packet(&packet) {
                Ok(()) => {
                    self.decoded += 1;
                    self.skipped_run = 0;
                }
                // A corrupt packet is skipped, as browsers do, unless the
                // stream is mostly corrupt.
                Err(MediaError::Decode(e)) => {
                    self.skipped += 1;
                    self.skipped_run += 1;
                    if self.skipped_run >= MAX_SKIPPED_RUN {
                        return Err(MediaError::Decode(e));
                    }
                    continue;
                }
                Err(e) => return Err(e),
            }
            let frames = (self.pcm.len() / 2) as i64;
            let start = (seconds(self.time_base.calc_time(packet.ts())) * self.rate as f64).round() as i64
                - self.delay as i64;
            let skip = (self.discard_to as i64 - start).clamp(0, frames);
            self.pos = (start + frames).max(0) as u64;
            if skip < frames {
                out.extend_from_slice(&self.pcm[skip as usize * 2..]);
                return Ok(true);
            }
        }
        // Scrambled AAC still decodes now and then (to noise), so the test at
        // the end is "mostly undecodable", which includes "nothing decoded".
        if self.skipped > self.decoded {
            return Err(MediaError::Decode(format!("{} of {} packets undecodable", self.skipped, self.skipped + self.decoded)));
        }
        Ok(false)
    }

    /// Decodes one packet into `self.pcm` as interleaved stereo.
    fn decode_packet(&mut self, packet: &Packet) -> Result<(), MediaError> {
        self.pcm.clear();
        match &mut self.codec {
            Codec::Opus(dec) => {
                self.pcm.resize(OPUS_MAX_FRAMES * 2, 0.0);
                let n = dec
                    .decode_float(&packet.data, &mut self.pcm, false)
                    .map_err(|e| MediaError::Decode(e.to_string()))?;
                self.pcm.truncate(n * 2);
            }
            Codec::Symphonia(dec, buf) => {
                // Every failure here, I/O-flavoured bit-reader underruns and
                // "unsupported" features of a scrambled frame included, is a bad packet.
                let decoded = dec.decode(packet).map_err(|e| MediaError::Decode(e.to_string()))?;
                let spec = *decoded.spec();
                let ch = spec.channels.count();
                if ch == 0 {
                    return Err(MediaError::Unsupported("no channels".into()));
                }
                // capacity() is in samples, decoded.capacity() in frames
                if buf.as_ref().is_none_or(|b| b.capacity() < decoded.capacity() * ch) {
                    *buf = Some(SampleBuffer::new(decoded.capacity() as u64, spec));
                }
                let buf = buf.as_mut().unwrap();
                buf.copy_interleaved_ref(decoded);
                for f in buf.samples().chunks_exact(ch) {
                    // mono duplicated; beyond stereo, keep front left/right
                    let r = if ch == 1 { f[0] } else { f[1] };
                    self.pcm.extend_from_slice(&[f[0], r]);
                }
            }
        }
        Ok(())
    }

    /// Seeks so the next `next_frames` starts at `seconds`; returns that
    /// position (the duration, or the target, when past the end).
    pub fn seek(&mut self, seconds: f64) -> Result<f64, MediaError> {
        let t = seconds.max(0.0);
        self.discard_to = (t * self.rate as f64).round() as u64;
        self.pos = self.discard_to;
        self.eof = false;
        let container = (t + self.delay as f64 / self.rate as f64 - PREROLL).max(0.0);
        let to = SeekTo::Time { time: Time::from(container), track_id: Some(self.track_id) };
        match self.format.seek(SeekMode::Accurate, to) {
            Ok(_) => {}
            Err(e) if is_eof(&e) || matches!(e, SymError::SeekError(SeekErrorKind::OutOfRange)) => {
                self.eof = true;
                return Ok(self.duration.map_or(t, |d| d.min(t)));
            }
            Err(e @ SymError::IoError(_)) => return Err(media_err(e)),
            Err(e) => return Err(MediaError::Decode(e.to_string())),
        }
        match &mut self.codec {
            Codec::Opus(dec) => dec.reset_state().map_err(|e| MediaError::Decode(e.to_string()))?,
            Codec::Symphonia(dec, _) => dec.reset(),
        }
        Ok(t)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustfft::{num_complex::Complex, FftPlanner};

    fn open(name: &str, fallback: Option<f64>) -> Decoder {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        Decoder::open(Box::new(std::fs::File::open(path).unwrap()), fallback).unwrap()
    }

    fn decode_all(d: &mut Decoder) -> Vec<f32> {
        let (mut all, mut buf) = (Vec::new(), Vec::new());
        while d.next_frames(&mut buf).unwrap() {
            assert_eq!(buf.len() % 2, 0);
            all.extend_from_slice(&buf);
        }
        all
    }

    /// Frequency of the strongest bin over one second of the left channel.
    fn peak_hz(interleaved: &[f32], rate: u32) -> f32 {
        let n = rate as usize;
        let start = rate as usize / 2;
        let mut buf: Vec<Complex<f32>> =
            (0..n).map(|i| Complex::new(interleaved[(start + i) * 2], 0.0)).collect();
        FftPlanner::new().plan_fft_forward(n).process(&mut buf);
        let k = (1..n / 2).max_by(|&a, &b| buf[a].norm().total_cmp(&buf[b].norm())).unwrap();
        k as f32 * rate as f32 / n as f32
    }

    fn check_tone(name: &str, fallback: Option<f64>) -> Decoder {
        let mut d = open(name, fallback);
        assert_eq!(d.channels(), 2);
        let rate = d.sample_rate();
        let pcm = decode_all(&mut d);
        let secs = pcm.len() as f64 / 2.0 / rate as f64;
        assert!((secs - 3.0).abs() < 0.05, "{name}: {secs} s");
        let hz = peak_hz(&pcm, rate);
        assert!((hz - 440.0).abs() <= 5.0, "{name}: {hz} Hz");
        // left and right carry the same tone
        assert!(pcm[48000..48100].chunks(2).all(|f| (f[0] - f[1]).abs() < 0.05));
        d
    }

    #[test]
    fn opus_webm_is_3s_of_440() {
        let d = check_tone("tone440-3s.webm", None);
        assert_eq!(d.sample_rate(), 48000);
        assert!((d.duration().unwrap() - 3.0).abs() < 0.05);
    }

    #[test]
    fn opus_starts_at_true_beginning() {
        // pre-skip dropped: the tone (amplitude 1/8) is there from the first ms
        let mut d = open("tone440-3s.webm", None);
        let mut buf = Vec::new();
        assert!(d.next_frames(&mut buf).unwrap());
        let peak = buf[..96].iter().fold(0f32, |m, x| m.max(x.abs()));
        assert!(peak > 0.03, "start is silent: {peak}");
    }

    #[test]
    fn aac_m4a_is_3s_of_440() {
        let d = check_tone("tone440-3s.m4a", None);
        assert_eq!(d.sample_rate(), 44100);
        assert!((d.duration().unwrap() - 3.0).abs() < 0.05);
    }

    #[test]
    fn no_duration_webm_uses_fallback() {
        let d = check_tone("tone440-3s-noduration.webm", Some(3.25));
        assert_eq!(d.duration(), Some(3.25));
    }

    #[test]
    fn container_duration_beats_fallback() {
        assert!((open("tone440-3s.webm", Some(9.0)).duration().unwrap() - 3.0).abs() < 0.05);
    }

    #[test]
    fn seek_lands_at_target() {
        for name in ["tone440-3s.webm", "tone440-3s.m4a", "tone440-3s-noduration.webm"] {
            let mut d = open(name, Some(3.0));
            let at = d.seek(1.5).unwrap();
            assert!((at - 1.5).abs() < 0.05, "{name}: seek returned {at}");
            let mut buf = Vec::new();
            assert!(d.next_frames(&mut buf).unwrap());
            let pos = d.position();
            assert!((1.5..1.6).contains(&pos), "{name}: position {pos}");
            // the rest of the file follows
            let rest = decode_all(&mut d).len() as f64 / 2.0 / d.sample_rate() as f64;
            assert!((pos + rest - 3.0).abs() < 0.05, "{name}: {pos} + {rest}");
        }
    }

    #[test]
    fn seek_past_end_is_end_of_stream() {
        for name in ["tone440-3s.webm", "tone440-3s.m4a"] {
            let mut d = open(name, None);
            d.seek(10.0).unwrap();
            assert!(!d.next_frames(&mut Vec::new()).unwrap(), "{name}");
        }
    }

    #[test]
    fn fragmented_mp4_is_3s_of_440() {
        check_tone("tone440-3s-frag.m4a", None);
    }

    #[test]
    fn corrupt_audio_is_decode_error() {
        // container intact, every AAC frame scrambled
        let path = format!("{}/tests/fixtures/tone440-3s.m4a", env!("CARGO_MANIFEST_DIR"));
        let mut bytes = std::fs::read(path).unwrap();
        let mdat = bytes.windows(4).position(|w| w == b"mdat").unwrap() + 4;
        let size = u32::from_be_bytes(bytes[mdat - 8..mdat - 4].try_into().unwrap()) as usize;
        for (i, b) in bytes[mdat..mdat - 8 + size].iter_mut().enumerate() {
            *b ^= (i * 7919 % 251) as u8 | 1;
        }
        let mut d = Decoder::open(Box::new(std::io::Cursor::new(bytes)), None).unwrap();
        let mut buf = Vec::new();
        let err = loop {
            match d.next_frames(&mut buf) {
                Ok(true) => continue,
                Ok(false) => panic!("corrupt stream ended quietly"),
                Err(e) => break e,
            }
        };
        assert_eq!(err.code(), 3, "{err}");
    }

    #[test]
    fn garbage_is_unsupported() {
        let junk: Vec<u8> = (0..4096u32).map(|i| (i * 7919 % 251) as u8).collect();
        let err = Decoder::open(Box::new(std::io::Cursor::new(junk)), None).err().unwrap();
        assert_eq!(err.code(), 4, "{err}");
    }
}
