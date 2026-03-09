use std::pin::Pin;

use futures_util::Stream;
use room_manager::domain::Card;

pub type CardStream = Pin<Box<dyn Stream<Item = anyhow::Result<Card>> + Send>>;

#[cfg(not(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
)))]
mod portable;
#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
mod raspi;

#[cfg(not(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
)))]
pub use portable::{new_sound_player, spawn_door_lock, spawn_readers};
#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub use raspi::{new_sound_player, spawn_door_lock, spawn_readers};
