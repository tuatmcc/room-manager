#![allow(async_fn_in_trait)]

pub mod entities;

pub use entities::*;

pub trait CardApi {
    /// Sends a card touch event to the upstream API.
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be completed or the response
    /// cannot be interpreted.
    async fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse>;
}

pub trait SoundPlayer {
    /// Queues or plays the requested sound event.
    ///
    /// # Errors
    ///
    /// Returns an error if the sound backend cannot accept or decode the
    /// requested audio.
    fn play(&self, sound: SoundEvent) -> anyhow::Result<()>;
    fn reset(&self);
}

pub trait Clock {
    fn now(&self) -> chrono::DateTime<chrono::Local>;
}

pub trait DoorLock {
    /// Unlocks the door.
    ///
    /// # Errors
    ///
    /// Returns an error if the door lock backend cannot perform the unlock
    /// operation.
    async fn unlock(&self) -> anyhow::Result<()>;
}
