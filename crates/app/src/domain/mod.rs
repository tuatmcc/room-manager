pub mod entities;

pub trait CardApi {
    async fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse>;
}

pub trait SoundPlayer {
    fn play(&self, sound: SoundEvent) -> anyhow::Result<()>;
    fn reset(&self);
}

pub trait Clock {
    fn now(&self) -> chrono::DateTime<chrono::Local>;
}

pub trait DoorLock {
    async fn unlock(&self) -> anyhow::Result<()>;
}

pub trait ServoController: Send + Sync {
    fn open(&self) -> anyhow::Result<()>;
    fn close(&self) -> anyhow::Result<()>;
}

pub trait I2cIrSensor {
    fn read(&self) -> anyhow::Result<u8>;
}

pub use entities::*;
