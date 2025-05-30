use crate::domain::DoorSensor;
use anyhow::{anyhow, Result};
use rppal::spi::{Bus, Mode, SlaveSelect, Spi};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn};

/// SHARP GP2Y0A21YK0F 赤外線測距センサー + MCP3002 A/Dコンバーター
pub struct Gp2y0aDistanceSensor {
    spi: Spi,
    channel: u8, // MCP3002のチャンネル（0または1）
    vref: f32,   // MCP3002の参照電圧（3.3V）
    threshold_distance: f32, // ドア開閉判定の閾値（cm）
}

impl Gp2y0aDistanceSensor {
    /// 新しい距離センサーインスタンスを作成
    /// 
    /// # Arguments
    /// * `channel` - MCP3002のチャンネル（0または1）
    /// * `threshold_distance` - ドア開閉判定の閾値（cm）。この値より近い場合、ドアが開いていると判定
    pub fn new(channel: u8, threshold_distance: f32) -> Result<Self> {
        if channel > 1 {
            return Err(anyhow!("MCP3002 channel must be 0 or 1"));
        }

        let spi = Spi::new(Bus::Spi0, SlaveSelect::Ss0, 100_000, Mode::Mode0)?;
        
        Ok(Self {
            spi,
            channel,
            vref: 3.3, // Raspberry Piの3.3V電源を使用
            threshold_distance,
        })
    }

    /// MCP3002からA/D変換値を読み取り
    fn read_adc(&mut self) -> Result<u16> {
        // MCP3002のコマンド形式
        // Start bit + SGL/DIFF + ODD/SIGN + MSBF + padding
        let cmd = 0x40 + ((2 + self.channel) << 4) + 8;
        
        let tx_buf = [cmd, 0x00];
        let mut rx_buf = [0u8; 2];
        
        self.spi.transfer(&mut rx_buf, &tx_buf)?;
        
        // 10ビットのA/D変換値を抽出
        let value = ((rx_buf[0] as u16) << 8 | rx_buf[1] as u16) & 0x3ff;
        
        debug!("ADC raw value: {}, cmd: 0x{:02x}", value, cmd);
        
        Ok(value)
    }

    /// A/D変換値を電圧に変換
    fn adc_to_voltage(&self, adc_value: u16) -> f32 {
        (adc_value as f32) / 1023.0 * self.vref
    }

    /// 電圧から距離を計算（GP2Y0A21YK0Fのデータシートベース）
    fn voltage_to_distance(&self, voltage: f32) -> f32 {
        // データシートの距離-電圧対応表（ラフな近似）
        // 距離が近いほど電圧が高い
        let dist_table = [
            (7.0, 3.0),
            (10.0, 2.25),
            (15.0, 1.7),
            (20.0, 1.3),
            (25.0, 1.1),
            (30.0, 0.9),
            (35.0, 0.8),
            (40.0, 0.75),
            (45.0, 0.7),
            (50.0, 0.6),
            (55.0, 0.55),
            (60.0, 0.5),
            (70.0, 0.45),
            (80.0, 0.4),
        ];

        // 電圧に対応する距離を線形補間で計算
        for i in 0..dist_table.len() - 1 {
            let (dist1, volt1) = dist_table[i];
            let (dist2, volt2) = dist_table[i + 1];
            
            if voltage <= volt1 && voltage >= volt2 {
                // 線形補間
                let volt_range = volt1 - volt2;
                let dist_range = dist2 - dist1;
                let volt_offset = volt1 - voltage;
                
                let distance = dist1 + (volt_offset / volt_range) * dist_range;
                return distance;
            }
        }

        // 範囲外の場合
        if voltage > dist_table[0].1 {
            // 最小距離未満（近すぎる）
            dist_table[0].0 - 1.0
        } else {
            // 最大距離超過（遠すぎる）
            dist_table[dist_table.len() - 1].0 + 10.0
        }
    }

    /// 距離を測定（内部実装）
    async fn measure_distance_internal(&mut self) -> Result<f32> {
        // 複数回測定して平均を取る（ノイズ対策）
        let mut measurements = Vec::new();
        
        for _ in 0..3 {
            let adc_value = self.read_adc()?;
            let voltage = self.adc_to_voltage(adc_value);
            let distance = self.voltage_to_distance(voltage);
            
            measurements.push(distance);
            
            // 測定間隔
            sleep(Duration::from_millis(10)).await;
        }

        // 異常値を除外して平均を計算
        measurements.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median = measurements[1]; // 中央値を使用
        
        debug!("Distance measurements: {:?}, median: {:.2}cm", measurements, median);
        
        Ok(median)
    }
}

#[async_trait::async_trait]
impl DoorSensor for Gp2y0aDistanceSensor {
    async fn is_door_open(&self) -> Result<bool> {
        // selfをmutableにするため、cloneして作業用インスタンスを作成
        // 実際のプロダクションコードでは、内部でMutexを使うか、別のアプローチを検討
        let mut sensor = Self::new(self.channel, self.threshold_distance)?;
        
        let distance = sensor.measure_distance_internal().await?;
        
        let is_open = distance < self.threshold_distance;
        
        debug!(
            "Door sensor: distance={:.2}cm, threshold={:.2}cm, is_open={}",
            distance, self.threshold_distance, is_open
        );
        
        // 測定値が有効範囲外の場合は警告
        if distance < 5.0 || distance > 85.0 {
            warn!(
                "Distance sensor reading out of valid range: {:.2}cm",
                distance
            );
        }

        Ok(is_open)
    }

    async fn measure_distance(&self) -> Result<f32> {
        let mut sensor = Self::new(self.channel, self.threshold_distance)?;
        sensor.measure_distance_internal().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_voltage_to_distance() {
        let sensor = Gp2y0aDistanceSensor {
            spi: unsafe { std::mem::zeroed() }, // テスト用ダミー
            channel: 0,
            vref: 3.3,
            threshold_distance: 30.0,
        };

        // テストケース
        assert!((sensor.voltage_to_distance(2.25) - 10.0).abs() < 1.0);
        assert!((sensor.voltage_to_distance(1.3) - 20.0).abs() < 1.0);
        assert!((sensor.voltage_to_distance(0.6) - 50.0).abs() < 5.0);
    }

    #[test]
    fn test_adc_to_voltage() {
        let sensor = Gp2y0aDistanceSensor {
            spi: unsafe { std::mem::zeroed() }, // テスト用ダミー
            channel: 0,
            vref: 3.3,
            threshold_distance: 30.0,
        };

        assert!((sensor.adc_to_voltage(0) - 0.0).abs() < 0.01);
        assert!((sensor.adc_to_voltage(1023) - 3.3).abs() < 0.01);
        assert!((sensor.adc_to_voltage(512) - 1.65).abs() < 0.01);
    }
}
