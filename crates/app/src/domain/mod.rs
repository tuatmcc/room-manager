pub mod entities;

pub trait CardReader {
    async fn next(&mut self) -> anyhow::Result<Option<Card>>;
}

pub trait CardApi {
    async fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse>;
}

pub trait SoundPlayer {
    fn play(&self, sound: SoundEvent, immediate: bool) -> anyhow::Result<()>;
}

pub trait Clock {
    fn now(&self) -> chrono::DateTime<chrono::Local>;
}

pub use entities::*;
