pub mod entities;

pub use entities::*;

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

    async fn lock_with_sensor_check<S>(&self, door_sensor: &mut S) -> anyhow::Result<bool>
    where
        S: DoorSensor;
}

/// ドアセンサー - ドアの開閉状態を検知
#[async_trait::async_trait]
pub trait DoorSensor: Send + Sync {
    async fn is_door_open(&self) -> anyhow::Result<bool>;

    /// 距離を測定（デバッグ用）
    async fn measure_distance(&self) -> anyhow::Result<f32>;
}
