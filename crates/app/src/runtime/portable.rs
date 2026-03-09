use futures_util::stream;
use room_manager::domain::{Card, DoorLock, SoundEvent, SoundPlayer};
use tracing::warn;

use crate::runtime::CardStream;

pub struct NoopSoundPlayer;

impl NoopSoundPlayer {
    // Keep the same fallible constructor shape as the real runtime.
    #[allow(clippy::unnecessary_wraps)]
    pub fn new() -> anyhow::Result<Self> {
        warn!("Running with noop sound player on this platform");
        Ok(Self)
    }
}

impl SoundPlayer for NoopSoundPlayer {
    fn play(&self, sound: SoundEvent) -> anyhow::Result<()> {
        warn!("Ignoring sound event on noop runtime: {:?}", sound);
        Ok(())
    }

    fn reset(&self) {}
}

pub struct NoopDoorLock;

impl NoopDoorLock {
    // Keep the same async constructor shape as the real runtime.
    #[allow(clippy::unused_async, clippy::unnecessary_wraps)]
    pub async fn spawn() -> anyhow::Result<Self> {
        warn!("Running with noop door lock on this platform");
        Ok(Self)
    }
}

impl DoorLock for NoopDoorLock {
    async fn unlock(&self) -> anyhow::Result<()> {
        warn!("Ignoring unlock request on noop runtime");
        Ok(())
    }
}

pub fn new_sound_player() -> anyhow::Result<NoopSoundPlayer> {
    NoopSoundPlayer::new()
}

pub async fn spawn_door_lock() -> anyhow::Result<NoopDoorLock> {
    NoopDoorLock::spawn().await
}

#[allow(clippy::unnecessary_wraps)]
pub fn spawn_readers() -> anyhow::Result<Vec<CardStream>> {
    warn!("Running without Pasori readers on this platform; no card events will be produced");
    Ok(vec![Box::pin(stream::pending::<anyhow::Result<Card>>())])
}
