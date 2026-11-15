//! Tauri commands over the engine. Arguments arrive camelCase from JS
//! (`startAt`, `fallbackDuration`, `targetGain`, `gainsDb`).

use super::dsp::Curve;
use super::{Engine, PlayerEvent, Slot};
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
pub fn player_subscribe(engine: State<'_, Engine>, channel: Channel<PlayerEvent>) {
    engine.subscribe(Box::new(move |e| {
        channel.send(e).is_ok()
    }));
}

#[tauri::command]
pub fn player_load(
    engine: State<'_, Engine>,
    slot: Slot,
    url: String,
    start_at: f64,
    fallback_duration: Option<f64>,
    generation: u64,
) {
    engine.load(slot, url, start_at, fallback_duration, generation);
}

#[tauri::command]
pub fn player_play(engine: State<'_, Engine>, slot: Slot) {
    engine.play(slot);
}

#[tauri::command]
pub fn player_pause(engine: State<'_, Engine>, slot: Slot) {
    engine.pause(slot);
}

#[tauri::command]
pub fn player_seek(engine: State<'_, Engine>, slot: Slot, seconds: f64) {
    engine.seek(slot, seconds);
}

#[tauri::command]
pub fn player_set_speed(engine: State<'_, Engine>, slot: Slot, speed: f32) {
    engine.set_speed(slot, speed);
}

#[tauri::command]
pub fn player_fade(engine: State<'_, Engine>, slot: Slot, target_gain: f32, seconds: f32, curve: Curve) {
    engine.fade(slot, target_gain, seconds, curve);
}

#[tauri::command]
pub fn player_set_gain(engine: State<'_, Engine>, slot: Slot, gain: f32) {
    engine.set_gain(slot, gain);
}

#[tauri::command]
pub fn player_unload(engine: State<'_, Engine>, slot: Slot) {
    engine.unload(slot);
}

#[tauri::command]
pub fn player_set_eq(engine: State<'_, Engine>, enabled: bool, gains_db: [f32; 9]) {
    engine.set_eq(enabled, gains_db);
}

#[tauri::command]
pub fn player_set_mono(engine: State<'_, Engine>, enabled: bool) {
    engine.set_mono(enabled);
}

#[tauri::command]
pub fn player_set_normalize(engine: State<'_, Engine>, enabled: bool) {
    engine.set_normalize(enabled);
}

#[tauri::command]
pub fn player_set_analysis(engine: State<'_, Engine>, enabled: bool) {
    engine.set_analysis(enabled);
}

/// `name: null` follows the system default.
#[tauri::command]
pub fn player_select_device(engine: State<'_, Engine>, name: Option<String>) {
    engine.select_device(name);
}

#[tauri::command]
pub fn player_list_devices(engine: State<'_, Engine>) -> Vec<String> {
    engine.list_devices()
}
