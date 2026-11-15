# Native audio engine: design

Date: 2026-11-15. Project 1 of `docs/superpowers/specs/2026-11-15-native-porchlight-overview.md`.

## Intent

Porchlight's music is played by `porchlight.exe` itself instead of WebView2, so Elgato Wave Link and Windows' volume mixer see "Porchlight" as the audio source. The engine is the one the native Slint app will use later; until then the current web UI drives it.

User's words: "keep everything as it is now". Every playback feature works exactly as today, and the native app is to be "as polished as possible".

## Goals

- All audio comes out of `porchlight.exe` (Windows) / the Porchlight process (Linux). No `<audio>` element and no WebAudio graph remain.
- Feature parity with today's engine (`src/lib/audio-engine.ts`, `audio-graph.ts`, `skip-silences.ts`):
  - play, pause, seek, duration, position, ended, errors, the loading state while the server prepares the file
  - volume with today's perceived-loudness (cubic) curve
  - crossfade with today's equal-power curve and timing (`crossfadeSec`, Rewind snippets' `SNIPPET_FADE_SEC`), and the preload of the next track before the crossfade starts
  - speed (`playbackRate`) with pitch preserved
  - 9-band EQ: bands `[62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]` Hz, lowshelf first, highshelf last, peaking Q 1.2 between, pre-attenuation by the largest boost, presets from `EQ_PRESETS`, custom gains
  - mono (L+R folded to both speakers)
  - normalize: today's compressor (threshold -24 dB, knee 30, ratio 12, attack 3 ms, release 250 ms, WebAudio-style automatic make-up gain)
  - output device choice, plus following the system default when "default" is chosen
  - the visualizer's data: the same 256 frequency bins as WebAudio's `getByteFrequencyData` with `fftSize` 512, smoothing 0.65, Blackman window, dB range -100..-30 mapped to 0..255, so the visualizer looks the same
  - Skip Silences' input: RMS of 512-sample frames (`skip-silences.ts` keeps its logic and thresholds)
  - local files (downloads) and streams, Premium and non-Premium (ephemeral) paths, SponsorBlock skips, podcast resume, Rewind snippets, sleep timer end-of-song, repeat one
- Music videos stay picture-only and muted, following the engine's position as they follow the audio today (`music-video.tsx`, drift re-sync at 0.4 s).
- The media controls already in Rust (SMTC in `media.rs`, taskbar buttons, Discord) keep working; their position and state come from the engine.

## Non-goals

- Changing queue, shuffle, repeat or crossfade decision logic: it stays in TypeScript for now and moves with the Slint app.
- Gapless playback beyond what today's preload gives.
- Any UI change. No new settings.
- Video audio (videos are muted today).

## Anti-goals

- Audible artifacts the web engine didn't have: clicks on pause/seek/track change, zipper noise on volume or EQ changes, pitch drift at speed changes, crackles under load.
- Any feature silently gone (the visualizer flat, Skip Silences inert, the device picker empty).
- A stall or wrong position when seeking into a part of a stream not yet downloaded.

## Approaches considered

1. **Hand-built Rust engine (chosen; user: "do the best fit for us").** Symphonia (pure Rust) demuxes WebM/Matroska and MP4 and decodes AAC; libopus (via a Rust binding) decodes Opus; cpal outputs to WASAPI on Windows and ALSA/PipeWire on Linux; our own DSP does every effect. Full control and one-to-one parity, including the visualizer and Skip Silences.
2. **FFmpeg decoding plus our own DSP.** More format-proof, but a 30-40 MB native dependency and a much harder Windows and Linux build.
3. **libmpv.** Least code for streaming and speed, but no access to the samples, so the visualizer and Skip Silences would need per-OS loopback capture of our own audio. Fragile where the user wants nothing to change.

## How it works (decided)

- **Where:** a new Rust module `src-tauri/src/player/` with focused files (source, decode, dsp, output, analysis, commands).
- **Input:** the engine reads from the existing local stream server (`/stream/:video_id`, `stream_handler` in `lib.rs`), the same URL the web engine uses today (`streamUrlFor` in `src/lib/stream.ts`, including the ephemeral flag). The server blocks until the file is fully cached (up to 120 s; progressive serving was tried and dropped, see the comment there), then serves the finished file with Range support. The engine keeps exactly that behaviour: no growing-file reading, no new download path.
- **Format:** sniffed from the bytes as the server does (`ftyp` → MP4/AAC, EBML → WebM/Opus).
- **Pipeline per track:** source → demux/decode → resample to the device rate → time-stretch (speed) → per-slot gain (volume and crossfade ramps). Two slots (current and next) are mixed, then the shared chain: EQ → mono → normalize → output, with the analysis tap after it (as today's analyser sits after the chain).
- **Ramps run in the audio thread:** volume, crossfade and EQ changes are smoothed per sample (no IPC-rate stepping). Crossfade is one command (`fade` on a slot: target gain, duration, equal-power curve), not volume calls from JavaScript.
- **Bridge to the web UI (interim):** Tauri commands to load/play/pause/seek/fade/set effects/select device/list devices, and a Tauri Channel streaming state (position, duration, playing, buffering, ended, error) about 4 times a second plus analysis frames (256 bins + RMS) at display rate while the visualizer or Skip Silences is on. `audio-engine.ts` keeps its logic and talks to a small `NativeMedia` adapter that offers the subset of `HTMLMediaElement` it uses today, so its control flow barely changes.
- **Output devices:** listed by cpal; the setting stores the device name. A saved WebAudio device id from before won't match, so it falls back to "System default" once (no error).
- **One engine for the whole app:** the floating player window shows the same playback (it reads the shared state); only the main window sends commands, as today.
- **Swap, no toggle:** the native engine replaces the web engine outright once it passes the checks; the WebAudio code is deleted. No hidden fallback setting.

## Settled after the builder check (Claude's calls)

- **Loading and errors:** while the server prepares the file, the adapter reports the same states an `<audio>` element does while waiting (no duration, `loading` status in the store). Errors map to the `MEDIA_ERR_*` codes `audio-engine.ts` already reads (~line 395): HTTP failure or timeout → 2 (network), a decode failure mid-stream → 3 (decode), an unrecognised container or codec → 4 (not supported). The existing single automatic retry and auto-advance logic then behave as today.
- **Formats:** everything comes from yt-dlp `bestaudio` (`lib.rs` ~3247), stored as `<id>.webm` whatever the real container (downloads copy the same file, `downloads.rs` ~468). In practice that is Opus in WebM or AAC in MP4. The engine accepts every format Symphonia decodes (MP3, FLAC, Vorbis, AAC, WebM, MP4) plus Opus via libopus, which is needed only because Symphonia has no Opus decoder. Decode tests cover Opus/WebM and AAC/MP4.
- **Duration and position:** duration comes from the container; when it's missing, the duration passed with `load` (the track's known length) is used. Position is the decoded sample position, so seeks, SponsorBlock skips, resume and `ended` work on real audio time.
- **Position between reports:** `NativeMedia.currentTime` interpolates: last reported position + elapsed wall time × speed while playing, snapped on every report and on seek. Reports come about 4 times a second, and immediately on play, pause, seek, load and end. That keeps the 0.4 s video drift check and the crossfade start point as accurate as today.
- **One engine:** the floating player window has no engine today (`App.tsx` returns early for it; `useAudioEngine` runs only in `AppShell`), so the Rust engine's two slots map one-to-one onto today's two elements (a and b).
- **Linux:** for this project Linux must build in CI (dependencies chosen to link on Ubuntu). Listening checks on Linux wait until WSL is set up; Windows is checked by ear.
- **Speed:** the range is today's 0.75, 1, 1.25 and 1.5 from Settings, plus Skip Silences' 4x boost (`SKIP_RATE`). The time-stretch library has to sound clean across 0.75 to 4x. Any good library with a GPL-compatible license that builds with MSVC is fine (no bit-exact parity with Chromium needed).

## Constraints (standing project rules)

- Tests: Rust unit tests for each DSP stage (EQ curve values at band centres, pre-attenuation, mono fold, compressor static curve, equal-power sum, visualizer bin mapping against known tones, RMS), decode tests on small synthetic fixtures (tones, no real music) for both WebM/Opus and MP4/AAC, a seek test on a finished file. Vitest for the adapter, including the `currentTime` interpolation (node env, no JSX).
- Dev runs follow the handoff's backup rules; app-only screenshots; no playback on the user's account unless a check needs it.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; log changes in the handoff doc; leave `src-tauri/Cargo.toml` line-ending noise out of commits (dependency additions to it are real changes and do get committed).
- Check in the running app before it's called done: Wave Link and the Windows volume mixer show Porchlight; every feature in Goals tried by ear; the visualizer side by side with a screenshot from the web engine.

## Left to the builder

- Crate choices within the approach (libopus binding, resampler, time-stretch library, FFT), as long as they build on Windows with MSVC and on Linux, and their licenses fit GPLv3.
- Buffer sizes and latency, within "no crackles, controls feel instant".
- Thread layout.
- Exact command and event names.
