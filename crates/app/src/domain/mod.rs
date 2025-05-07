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

pub trait ServoController {
    fn open(&mut self) -> anyhow::Result<()>;
    fn close(&mut self) -> anyhow::Result<()>;
}

pub use entities::*;
