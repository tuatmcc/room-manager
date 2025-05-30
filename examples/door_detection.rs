use anyhow::Result;
use room_manager::domain::DoorSensor;
use room_manager::infra::Gp2y0aDistanceSensor;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn};

#[tokio::main]
async fn main() -> Result<()> {
    // ログ初期化
    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .init();

    info!("ドア開閉検知システム開始");

    // 距離センサー初期化
    // チャンネル1, 閾値30cm（30cm以内の物体を検知した場合、ドアが開いていると判定）
    let sensor = Gp2y0aDistanceSensor::new(1, 30.0)?;
    
    info!("GP2Y0A21YK0F距離センサー初期化完了");
    info!("MCP3002 チャンネル: 1");
    info!("ドア開閉判定閾値: 30.0cm");

    let mut previous_state = None;

    loop {
        match sensor.is_door_open().await {
            Ok(is_open) => {
                // 状態変化時のみログ出力
                if previous_state.is_none() || previous_state != Some(is_open) {
                    let status = if is_open { "開" } else { "閉" };
                    info!("ドア状態: {}", status);
                    
                    // デバッグ用：実際の距離も表示
                    if let Ok(distance) = sensor.measure_distance().await {
                        info!("測定距離: {:.2}cm", distance);
                    }
                    
                    previous_state = Some(is_open);
                }
            }
            Err(e) => {
                warn!("センサー読み取りエラー: {}", e);
            }
        }
        
        // 500ms間隔で監視
        sleep(Duration::from_millis(500)).await;
    }
}
