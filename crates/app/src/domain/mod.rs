pub mod entities;
pub mod errors;

pub trait CardReader {
    fn poll(&mut self) -> anyhow::Result<Option<CardId>>;
    async fn wait_release(&mut self, card: &CardId) -> anyhow::Result<()>;
}

pub trait CardApi {
    fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse>;
}

pub trait SoundPlayer {
    fn play(&self, sound: SoundEvent) -> anyhow::Result<()>;
}

pub trait Clock {
    fn now(&self) -> chrono::DateTime<chrono::Local>;
}

// 再エクスポート
pub use entities::*;
pub use errors::*;
