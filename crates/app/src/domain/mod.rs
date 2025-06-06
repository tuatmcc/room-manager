pub mod entities;

use std::{future::Future, pin::Pin};
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
pub trait DoorSensor: Send + Sync {
    fn is_door_open(
        &self,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<bool>> + Send + '_>>;

    /// 距離を測定（デバッグ用）
    fn measure_distance(
        &self,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<f32>> + Send + '_>>;
}
