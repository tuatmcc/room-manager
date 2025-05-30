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
}

/// ドアセンサー - ドアの開閉状態を検知
pub trait DoorSensor {
    /// ドアが開いているかどうかを確認
    /// 
    /// # Returns
    /// - `Ok(true)` - ドアが開いている
    /// - `Ok(false)` - ドアが閉まっている
    /// - `Err(_)` - センサー読み取りエラー
    async fn is_door_open(&self) -> anyhow::Result<bool>;
    
    /// 距離を測定（デバッグ用）
    /// 
    /// # Returns
    /// - `Ok(distance)` - 測定した距離（cm）
    /// - `Err(_)` - センサー読み取りエラー
    async fn measure_distance(&self) -> anyhow::Result<f32>;
}
