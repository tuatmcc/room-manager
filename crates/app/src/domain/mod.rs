pub mod entities;

use async_trait::async_trait;
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

    /// ドアセンサーでドア状態を確認してから施錠
    ///
    /// # Returns
    /// - `Ok(true)` - ドアが閉まっていて施錠成功
    /// - `Ok(false)` - ドアが開いていて施錠できない
    /// - `Err(_)` - センサーまたは施錠エラー
    async fn lock_with_sensor_check<S>(&self, door_sensor: &mut S) -> anyhow::Result<bool>
    where
        S: DoorSensor;
}

/// ドアセンサー - ドアの開閉状態を検知
#[async_trait::async_trait]
pub trait DoorSensor: Send + Sync {
    /// ドアが開いているかどうかを確認
    ///
    /// # Returns
    /// - `Ok(true)` - ドアが開いている
    /// - `Ok(false)` - ドアが閉まっている
    /// - `Err(_)` - センサー読み取りエラー
    async fn is_door_open(&mut self) -> anyhow::Result<bool>;

    /// 距離を測定（デバッグ用）
    ///
    /// # Returns
    /// - `Ok(distance)` - 測定した距離（cm）
    /// - `Err(_)` - センサー読み取りエラー
    async fn measure_distance(&mut self) -> anyhow::Result<f32>;
}
