import { Channel, invoke } from "@tauri-apps/api/core";

/**
 * The slice of HTMLAudioElement that audio-engine.ts and skip-silences.ts use,
 * backed by one slot of the native engine (src-tauri/src/player). Both slots
 * share one Channel; reports are routed by slot and dropped when their
 * generation is not the current one.
 */

type Slot = "a" | "b";
export type FadeCurve = "linear" | "equalPowerIn" | "equalPowerOut";

type StateReport = {
  kind: "state";
  slot: "A" | "B";
  generation: number;
  position: number;
  duration: number | null;
  playing: boolean;
  loading: boolean;
  ended: boolean;
  error_code?: number;
};
type AnalysisReport = { kind: "analysis"; bins: number[]; rms: number };

const slots = new Map<"A" | "B", NativeMedia>();
const analysisSubs = new Set<(bins: number[], rms: number) => void>();
let channel: Channel<StateReport | AnalysisReport> | null = null;

function ensureChannel() {
  if (channel) return;
  channel = new Channel<StateReport | AnalysisReport>();
  channel.onmessage = (e) => {
    if (e.kind === "analysis") analysisSubs.forEach((f) => f(e.bins, e.rms));
    else slots.get(e.slot)?._report(e);
  };
  void invoke("player_subscribe", { channel });
}

/** Frames from the engine's analyser (Task 7 feeds the visualizer and Skip Silences). */
export function subscribeAnalysis(fn: (bins: number[], rms: number) => void): () => void {
  ensureChannel();
  analysisSubs.add(fn);
  return () => void analysisSubs.delete(fn);
}

const send = (cmd: string, args: Record<string, unknown>) => {
  void invoke(cmd, args).catch((e) => console.error(`[native-media] ${cmd} failed:`, e));
};

export class NativeMedia extends EventTarget {
  private readonly id: "A" | "B";
  private gen = 0;
  private url = "";
  private rate = 1;
  private vol = 1;
  private pos = 0;
  private anchor = 0; // performance.now() when `pos` was taken
  private dur = NaN;
  private isPaused = true;
  private isPlaying = false; // engine's word, from the last report
  private isEnded = false;
  private isLoading = false;
  private seekPending = false;
  private err: { code: number } | null = null;
  readyState = 0;
  // Inert here: the engine decodes itself. Kept so audio-engine.ts can still set them.
  muted = false;
  preload = "";
  crossOrigin: string | null = null;
  preservesPitch = true;

  constructor(slot: Slot) {
    super();
    this.id = slot === "a" ? "A" : "B";
    slots.set(this.id, this);
    ensureChannel();
  }

  private emit(type: string) {
    this.dispatchEvent(new Event(type));
  }

  get src() {
    return this.url;
  }
  get currentSrc() {
    return this.url;
  }
  set src(url: string) {
    if (!url) {
      this.removeAttribute("src");
      return;
    }
    this.url = url;
    this.gen++;
    this.reset();
    send("player_load", { slot: this.id, url, startAt: 0, fallbackDuration: null, generation: this.gen });
    if (this.rate !== 1) send("player_set_speed", { slot: this.id, speed: this.rate });
  }

  /** `removeAttribute("src")` + `load()` is how audio-engine.ts unloads an element. */
  removeAttribute(name: string) {
    if (name !== "src") return;
    this.url = "";
    this.gen++; // stale reports from the old load must not land
    this.reset();
    send("player_unload", { slot: this.id });
  }
  load() {} // src's setter already loads

  private reset() {
    this.pos = 0;
    this.dur = NaN;
    this.isPaused = true;
    this.isPlaying = false;
    this.isEnded = false;
    this.isLoading = false;
    this.seekPending = false;
    this.err = null;
    this.readyState = 0;
  }

  get currentTime() {
    const live = this.isPlaying && !this.isPaused;
    const t = live ? this.pos + ((performance.now() - this.anchor) / 1000) * this.rate : this.pos;
    return Number.isFinite(this.dur) ? Math.min(t, this.dur) : t;
  }
  set currentTime(s: number) {
    if (!this.url) return;
    this.pos = s;
    this.anchor = performance.now();
    this.isEnded = false;
    this.seekPending = true;
    send("player_seek", { slot: this.id, seconds: s });
  }

  get duration() {
    return this.dur;
  }
  get paused() {
    return this.isPaused;
  }
  get ended() {
    return this.isEnded;
  }
  get error() {
    return this.err;
  }

  get volume() {
    return this.vol;
  }
  set volume(v: number) {
    if (v === this.vol) return;
    this.vol = v;
    send("player_set_gain", { slot: this.id, gain: v });
  }

  get playbackRate() {
    return this.rate;
  }
  set playbackRate(r: number) {
    if (r === this.rate) return; // a speed change re-seeks inside the engine
    this.pos = this.currentTime;
    this.anchor = performance.now();
    this.rate = r;
    if (this.url) send("player_set_speed", { slot: this.id, speed: r });
  }
  get defaultPlaybackRate() {
    return this.rate;
  }
  set defaultPlaybackRate(_: number) {}

  play(): Promise<void> {
    if (this.isEnded) {
      this.pos = 0;
      this.isEnded = false;
    }
    this.anchor = performance.now();
    const was = this.isPaused;
    this.isPaused = false;
    send("player_play", { slot: this.id });
    if (was) this.emit("play");
    return Promise.resolve();
  }

  pause() {
    if (this.isPaused) return;
    this.pos = this.currentTime;
    this.isPaused = true;
    send("player_pause", { slot: this.id });
    this.emit("pause");
  }

  fadeTo(gain: number, seconds: number, curve: FadeCurve = "linear") {
    this.vol = gain;
    send("player_fade", { slot: this.id, targetGain: gain, seconds, curve });
  }

  /** @internal Called by the shared channel. */
  _report(r: StateReport) {
    if (r.generation !== this.gen || !this.url) return;
    this.pos = r.position;
    this.anchor = performance.now();

    if (r.duration !== null && r.duration !== this.dur) {
      const first = Number.isNaN(this.dur);
      this.dur = r.duration;
      if (first) {
        this.readyState = 1;
        this.emit("loadedmetadata");
      }
      this.emit("durationchange");
    }
    if (r.loading !== this.isLoading) {
      this.isLoading = r.loading;
      if (r.loading) {
        if (!this.isPaused) this.emit("waiting");
      }
    }
    if (!r.loading && !Number.isNaN(this.dur) && this.readyState < 4) {
      this.readyState = 4;
      this.emit("canplay");
    }
    if (r.playing && !this.isPlaying) {
      this.isPlaying = true;
      this.emit("playing");
    } else if (!r.playing) {
      this.isPlaying = false;
    }
    if (this.seekPending) {
      this.seekPending = false;
      this.emit("seeked");
    }
    this.emit("timeupdate");
    if (r.ended && !this.isEnded) {
      this.isEnded = true;
      this.isPaused = true;
      this.emit("ended");
    }
    if (r.error_code && !this.err) {
      this.err = { code: r.error_code };
      this.emit("error");
    }
  }
}
