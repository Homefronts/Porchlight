# Native Audio Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `porchlight.exe` plays all music itself with every current playback feature, driven by the existing web UI.

**Architecture:** A Rust module `src-tauri/src/player/` fetches the finished file from the local stream server, decodes it (Symphonia + libopus), resamples and time-stretches per slot, mixes two slots, runs the shared chain (EQ, mono, normalize), feeds an analysis tap, and outputs through cpal. Tauri commands control it; a Tauri Channel reports state and analysis frames. In TypeScript a `NativeMedia` adapter stands in for today's two `<audio>` elements.

**Tech Stack:** Rust (symphonia, libopus binding, rubato or similar resampler, a time-stretch library, rustfft, cpal), Tauri 2 commands + `tauri::ipc::Channel`, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-native-audio-engine-design.md` (overview: `docs/superpowers/specs/2026-11-15-native-porchlight-overview.md`)

## Global Constraints

- Every feature in the spec's Goals keeps today's behaviour; no UI change, no new setting.
- EQ: bands `[62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]` Hz; band 0 lowshelf, band 8 highshelf, others peaking Q 1.2; pre-attenuate by the largest boost (`dbToGain(-maxBoost)`); gains from `EQ_PRESETS` / custom in `src/lib/store/playback-settings.ts`.
- Normalize: compressor threshold -24 dB, knee 30 dB, ratio 12, attack 0.003 s, release 0.25 s, with WebAudio's automatic make-up gain.
- Visualizer data: `fftSize` 512 → 256 bins, smoothing 0.65, Blackman window, dB range -100..-30 → 0..255 (WebAudio `getByteFrequencyData` semantics). Skip Silences: RMS of 512-sample frames; `SKIP_RATE` 4.
- Volume: today's cubic perceived-loudness curve stays in TypeScript; the engine receives linear gain.
- Crossfade: equal-power, run in the audio thread from one command.
- Speeds: 0.75, 1, 1.25, 1.5 and 4 (Skip Silences), pitch preserved.
- Errors map to `MEDIA_ERR_*`: HTTP failure/timeout 2, decode failure 3, unsupported container/codec 4.
- The engine reads `/stream/:video_id` from the existing server (blocks until cached, then Range-served). No new download path.
- New crates: licenses compatible with GPLv3, build with MSVC on Windows and on ubuntu-22.04 in CI (add `libasound2-dev` and anything else needed to `.github/workflows/ci.yml` and `release.yml` apt lines).
- Dev-only tools allowed to install via winget if a task needs them: CMake (`Kitware.CMake`) for a libopus build, FFmpeg (`Gyan.FFmpeg`) for generating test fixtures. Never shipped.
- Test fixtures: synthetic tones only, a few seconds, committed under `src-tauri/tests/fixtures/`.
- Rust tests run with `cargo test --manifest-path src-tauri/Cargo.toml`; TS tests with vitest (node env, `// @vitest-environment jsdom` for DOM, no JSX in tests).
- Run pnpm/cargo from PowerShell with `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:APPDATA\npm;$env:Path";`. Write non-ASCII files with Write/Edit only.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave `src-tauri/Cargo.toml` line-ending-only noise out; real dependency changes to it are committed. Log each task in `docs/superpowers/handoffs/2026-10-31-full-project.md`.
- Subagents never launch the app (Task 8 is the controller's, with backups).

## Review Focus

1. **Rapid track changes** (skip five times fast): state reports from an old track must never update the new one (reports carry a load generation id; the adapter drops stale ones). Pinned in Task 5 and Task 6.
2. **Seek at or past the end, or to 0 while paused:** ends cleanly or lands at 0 with no burst of old audio; `ended` fires once. Pinned in Task 5.
3. **Output device unplugged mid-song, or the system default changes:** playback moves to the new default (or the default when the chosen device vanishes) without stopping the app. Pinned in Task 5 (device-loss handling unit-tested with the output behind a trait).
4. **Speed change during a crossfade, or Skip Silences boosting at 4x as a crossfade starts:** both slots honour their own speed; the fade still sums to equal power. Pinned in Task 4 and Task 5.
5. **A file with no container duration:** falls back to the duration given at load; position and `ended` still correct. Pinned in Task 3.

---

## File Structure

- `src-tauri/src/player/mod.rs`: `Engine` (two slots, mixer, shared chain), public API used by commands.
- `src-tauri/src/player/dsp.rs`: biquad EQ, mono, compressor, gain ramp, equal-power fade. Pure.
- `src-tauri/src/player/analysis.rs`: spectrum bins and RMS. Pure.
- `src-tauri/src/player/source.rs`: HTTP Range reader (`Read + Seek`) over the stream server URL.
- `src-tauri/src/player/decode.rs`: Symphonia probe/demux, AAC and others via Symphonia, Opus via libopus; yields interleaved f32 frames, duration, seek.
- `src-tauri/src/player/stretch.rs`: resample to device rate + pitch-preserving time-stretch.
- `src-tauri/src/player/output.rs`: cpal output behind an `Output` trait (fake in tests), device list, default following.
- `src-tauri/src/player/commands.rs`: Tauri commands and the Channel.
- `src/lib/native-media.ts`: the `NativeMedia` adapter.

---

### Task 1: DSP core

**Files:** Create `src-tauri/src/player/mod.rs` (module declarations only for now), `src-tauri/src/player/dsp.rs`; Modify `src-tauri/src/lib.rs` (`mod player;`).

**Interfaces (Produces):**
- `pub struct Eq9` with `new(sample_rate: f32)`, `set(enabled: bool, gains_db: [f32; 9])`, `process(&mut self, frame: &mut [f32; 2])`. Smoothed coefficient/gain changes (no zipper).
- `pub fn fold_mono(frame: &mut [f32; 2])`.
- `pub struct Compressor` with `new(sample_rate: f32)`, `process(&mut self, frame: &mut [f32; 2])`, constants from Global Constraints.
- `pub struct Ramp` with `new(value: f32)`, `to(target: f32, seconds: f32, sample_rate: f32, curve: Curve)`, `next(&mut self) -> f32`, `is_done()`; `pub enum Curve { Linear, EqualPowerIn, EqualPowerOut }`.

- [ ] **Step 1: Failing tests** in `dsp.rs`: EQ disabled is bit-transparent; EQ with `bass` preset (`[10, 8, 5, 2, 0, -1, -1, 0, 0]`) measured with a 62 Hz and a 1 kHz sine after settling: 62 Hz level ≈ `+10 - 10` dB (pre-attenuation) within 1 dB, 1 kHz ≈ `-10` dB within 1 dB; flat preset at 0 dB is transparent within 0.01 dB. `fold_mono([1.0, 0.0])` → `[0.5, 0.5]`. Compressor: steady -6 dBFS sine output level is below input and stable; a -60 dBFS sine is raised by the make-up gain. Ramp: EqualPowerIn and EqualPowerOut of the same duration sum to power 1 (`a²+b²≈1`) at every sample; a Linear ramp hits its target exactly at the end.
- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml player::dsp`. Expected: FAIL (not defined).
- [ ] **Step 3:** Implement (RBJ cookbook biquads; compressor modelled on WebAudio's DynamicsCompressor: soft knee, look-ahead not required; make-up gain per WebAudio's formula `(1/fullRangeGain)^0.6`).
- [ ] **Step 4:** Tests pass; `cargo clippy` clean on the module.
- [ ] **Step 5: Commit** `feat(player): DSP core`.

---

### Task 2: Analysis tap

**Files:** Create `src-tauri/src/player/analysis.rs`; add `rustfft` (or equivalent) to Cargo.toml.

**Interfaces (Produces):** `pub struct Analyser` with `new()`, `push(&mut self, frame: [f32; 2])` (mixes to mono like WebAudio's analyser down-mix), `bins(&mut self) -> [u8; 256]`, `rms(&self) -> f32` (of the last 512 mono samples).

- [ ] **Step 1: Failing tests:** silence → all bins 0, rms 0; a full-scale 1 kHz sine at 48 kHz → the peak bin is `round(1000 / (48000/512))` ± 1 and reads 255; a sine at -70 dBFS sits between 0 and 255 at the value the -100..-30 mapping predicts ± 8; smoothing: after the sine stops, the peak bin decays geometrically with factor 0.65 per call (the WebAudio smoothing rule) rather than dropping to 0 at once; rms of a full-scale sine ≈ 0.707.
- [ ] **Step 2:** run, FAIL. **Step 3:** implement (Blackman window, magnitude / fftSize, smoothing, dB, byte mapping). **Step 4:** pass. **Step 5: Commit** `feat(player): analysis tap`.

---

### Task 3: Source and decode

**Files:** Create `src-tauri/src/player/source.rs`, `src-tauri/src/player/decode.rs`, fixtures in `src-tauri/tests/fixtures/` (`tone440-3s.webm` Opus, `tone440-3s.m4a` AAC, `tone440-3s-noduration.webm` with duration stripped); add symphonia (features: mkv, isomp4, aac + defaults) and a libopus binding to Cargo.toml.

**Interfaces (Produces):**
- `pub struct HttpSource` implementing `std::io::Read + Seek + symphonia::core::io::MediaSource` over a URL using Range requests (blocking reqwest in the decode thread is fine), `HttpSource::open(url: &str) -> Result<Self, MediaError>`.
- `pub enum MediaError { Network(String), Decode(String), Unsupported(String) }` with `code(&self) -> u8` returning 2, 3, 4.
- `pub struct Decoder` with `open(source: Box<dyn MediaSource>, fallback_duration: Option<f64>) -> Result<Self, MediaError>`, `sample_rate()`, `channels()`, `duration() -> Option<f64>` (container, else fallback), `next_frames(&mut self, out: &mut Vec<f32>) -> Result<bool, MediaError>` (interleaved stereo f32; mono sources duplicated; false at end), `seek(&mut self, seconds: f64) -> Result<f64, MediaError>` (returns the actual position), `position() -> f64`.

- [ ] **Step 1:** Generate the fixtures (FFmpeg, dev-only) and commit them with a one-line `README` saying how they were made.
- [ ] **Step 2: Failing tests:** each fixture decodes to ~3 s of 440 Hz (count samples; FFT peak at 440 ± 5 Hz); `duration()` ≈ 3.0 for both, and equals the fallback for the no-duration file; `seek(1.5)` then decoding gives position ≥ 1.5 and < 1.6; seeking past the end returns end-of-stream on the next read; a garbage file gives `Unsupported` (code 4); an `HttpSource` against a small local test server (spawned in the test with axum, already a dependency) reads the same bytes as the file and supports seek; a 404/closed port gives `Network` (code 2).
- [ ] **Step 3:** run, FAIL. **Step 4:** implement. **Step 5:** pass, and `cargo build` still works on Windows. Add any apt packages the binding needs to both workflow files.
- [ ] **Step 6: Commit** `feat(player): stream source and decoders`.

---

### Task 4: Resample and time-stretch

**Files:** Create `src-tauri/src/player/stretch.rs`; add the resampler and time-stretch crates.

**Interfaces (Produces):** `pub struct Stretcher` with `new(in_rate: u32, out_rate: u32)`, `set_speed(&mut self, speed: f32)` (takes effect smoothly), `process(&mut self, input: &[f32], output: &mut Vec<f32>)` (interleaved stereo), `latency_frames() -> usize`, `reset()` (after seek).

- [ ] **Step 1: Failing tests:** 48 kHz → 44.1 kHz at speed 1: output length ≈ input × 44.1/48 ± latency; 440 Hz in → 440 Hz out. At speeds 0.75, 1.5 and 4: output length ≈ input / speed (± 2 %) and the FFT peak stays 440 ± 5 Hz (pitch preserved). Changing speed mid-stream produces no sample above 1.0 when the input is ≤ 0.5 (no blow-ups).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** pass. **Step 5: Commit** `feat(player): resample and time-stretch`.

---

### Task 5: Engine, output and commands

**Files:** Modify `src-tauri/src/player/mod.rs`; create `output.rs`, `commands.rs`; register commands in `lib.rs` `generate_handler!`; add `cpal`.

**Interfaces (Produces):**
- `trait Output` (start with a render callback, list devices, select by name, notify default change); `CpalOutput` and a test `FakeOutput` that pulls N frames on demand.
- `Engine` with two slots `A`/`B`. Per slot: `load(slot, url, start_at: f64, fallback_duration: Option<f64>, generation: u64)`, `play(slot)`, `pause(slot)`, `seek(slot, seconds)`, `set_speed(slot, speed)`, `fade(slot, target_gain, seconds, curve)`, `set_gain(slot, gain)`, `unload(slot)`. Shared: `set_eq(enabled, gains_db)`, `set_mono(bool)`, `set_normalize(bool)`, `set_analysis(enabled: bool)`, `select_device(name: Option<String>)`, `list_devices() -> Vec<String>`. Decoding runs on a worker thread per slot feeding a lock-free ring buffer; the audio callback never blocks or allocates.
- Report (to the Channel): `{ slot, generation, kind: "state", position, duration, playing, loading, ended, error_code? }` about every 250 ms and immediately on play/pause/seek/load/end/error; `{ kind: "analysis", bins: [u8;256], rms }` at ~60 Hz while analysis is on.
- Tauri commands `player_*` mirroring the methods, plus `player_subscribe(channel: Channel<PlayerEvent>)`.

- [ ] **Step 1: Failing tests** (with `FakeOutput` and fixture files read through a file source): load + play produces non-silent output and a state report with the right generation; pause outputs silence after a ≤ 10 ms ramp (no click: max sample-to-sample jump under a threshold); seek to 1.0 reports position ≈ 1.0; seek past the end reports `ended` exactly once; loading slot A again with generation 2 means no report with generation 1 appears afterwards; a `fade` from A to B with EqualPower curves keeps summed power ≈ 1 through the fade; slot speeds 1 and 4 at once both progress at their own rate; device loss in `FakeOutput` triggers a switch to the default and playback continues; analysis frames stop when disabled.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** pass; `cargo build` and `cargo clippy` clean. **Step 5: Commit** `feat(player): engine, output and commands`.

---

### Task 6: `NativeMedia` adapter

**Files:** Create `src/lib/native-media.ts`, `src/lib/native-media.test.ts`.

**Interfaces:**
- Consumes Task 5's commands and events (exact names from `commands.rs`).
- Produces `class NativeMedia` (one per slot `"a" | "b"`) offering the `HTMLMediaElement` subset `audio-engine.ts` uses today: `src` (setter triggers load with a new generation), `currentTime` (get interpolates: last position + elapsed × speed while playing; set seeks), `duration`, `paused`, `ended`, `volume` (linear gain to the engine), `playbackRate`, `play(): Promise<void>`, `pause()`, `error: { code } | null`, `readyState`, and the events `audio-engine.ts` listens to (`play`, `pause`, `timeupdate`, `ended`, `error`, `loadedmetadata`, `canplay`, `waiting`, `seeked`) via `addEventListener`/`removeEventListener`. Plus `fadeTo(gain, seconds, curve)`.
- Before writing it, list every member and event of the two `<audio>` elements that `audio-engine.ts`, `skip-silences.ts`, `music-video.tsx` and the crossfade code touch (grep), and cover exactly those.

- [ ] **Step 1: Failing tests** with a mocked `invoke` and a fake channel: setting `src` sends a load with generation n+1; reports with an older generation are ignored; `currentTime` while playing at speed 1.5 advances 1.5 s per wall second between reports (fake timers) and snaps to each report; `currentTime` while paused doesn't move; an error report with code 4 sets `error.code === 4` and fires `error`; `ended` fires once.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** pass, tsc, eslint. **Step 5: Commit** `feat(player): NativeMedia adapter`.

---

### Task 7: Switch the app to the native engine

**Files:** Modify `src/lib/audio-engine.ts` (two `NativeMedia` instead of `<audio>`; crossfade via `fadeTo`; effects via `player_set_*`), `src/lib/skip-silences.ts` (RMS from analysis frames instead of `AnalyserNode`), `src/components/layout/echo-visualizer.tsx` (bins from analysis frames), the output-device setting UI and store (device names from `player_list_devices`; an old WebAudio id falls back to "System default"), `src/components/layout/music-video.tsx` only if its position source needs the adapter; delete `src/lib/audio-graph.ts` and any `<audio>` element rendering; update or delete tests that only tested WebAudio wiring.

- [ ] **Step 1:** Grep and list every consumer of `audio-graph.ts`, `currentAnalyser`, `canSelectOutputDevice`, the `<audio>` refs and `setSinkId`; each gets its native replacement.
- [ ] **Step 2: Failing tests:** `skip-silences` test fed RMS frames from a fake source boosts to 4x on silence and drops back on sound (same thresholds as today); output-device store: an unknown saved id resolves to default.
- [ ] **Step 3:** Make the switch. Analysis is enabled only while the visualizer is visible or Skip Silences is on.
- [ ] **Step 4:** Full `pnpm vitest run`, `pnpm tsc --noEmit`, eslint on touched files, `cargo test`, `cargo build`. All pass.
- [ ] **Step 5: Commit** `feat(player): play through the native engine; remove WebAudio`.

---

### Task 8: Live check (controller, with the user's data backed up)

- [ ] **Step 1:** Close Porchlight, back up both data folders and the two registry keys (handoff hard rule 3), launch the dev build (run-app skill, PowerShell PATH prefix).
- [ ] **Step 2:** With the user's OK to play: Windows volume mixer and Wave Link list Porchlight as the source while a song plays; nothing comes from `msedgewebview2.exe` (check the mixer).
- [ ] **Step 3:** By ear and by state: play, pause, seek, skip rapidly, crossfade (on and off), speed 0.75 to 1.5, Skip Silences on a track with silence, EQ presets, mono, normalize, output device switch and the system default changing, music video mode following, a podcast resume, a download played offline, a Rewind snippet, sleep timer end-of-song, repeat one.
- [ ] **Step 4:** Visualizer side by side with an app-only screenshot taken from the web engine before the switch (take it first on the commit before Task 7 if missing).
- [ ] **Step 5:** Restore registry keys; verify data. Fix anything found (each fix through a fresh implementer and a scoped review). Update the README (Features: plays natively; Wave Link works) and the handoff.
