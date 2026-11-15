//! Native audio engine: porchlight.exe plays the music itself.

// Nothing calls into the engine until the output stream lands (Task 5).
#![allow(dead_code)]

pub mod analysis;
pub mod decode;
pub mod dsp;
pub mod source;
pub mod stretch;
