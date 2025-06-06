use crate::domain::DoorSensor;
use anyhow::{Context, Result, anyhow};
use rppal::spi::{Bus, Mode, SlaveSelect, Spi};
use std::sync::Mutex;
use std::time::Duration;
use thiserror::Error;
use tokio::time::sleep;
use tracing::{debug, instrument, warn};
use std::{future::Future, pin::Pin};

const DOOR_SENSOR_MCP3002_CHANNEL: MCP3002Channel = MCP3002Channel::Channel0;
const DOOR_SENSOR_THRESHOLD_DISTANCE: f32 = 5.0; // cm

const DISTANCE_SENSOR_MIN_VALID_RANGE: f32 = 0.0; // cm
const DISTANCE_SENSOR_MAX_VALID_RANGE: f32 = 80.0; // cm

/// 距離センサー設定
#[derive(Debug, Clone)]
pub struct SensorConfig {
    /// MCP3002のチャンネル（0または1）
    pub channel: MCP3002Channel,
    /// MCP3002の参照電圧（V）
    pub reference_voltage: f32,
    /// ドア開閉判定の閾値（cm）
    pub threshold_distance: f32,
    /// 測定回数（ノイズ対策）
    pub measurement_count: u8,
    /// 測定間隔（ms）
    pub measurement_interval: u64,
}

/// MCP3002のチャンネル
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MCP3002Channel {
    Channel0 = 0,
    Channel1 = 1,
}

/// 距離センサーエラー
#[derive(Error, Debug)]
pub enum SensorError {
    #[error("SPI communication failed: {0}")]
    SpiError(#[from] rppal::spi::Error),
    #[error("Invalid channel: {0}. Must be 0 or 1")]
    InvalidChannel(u8),
    #[error("Measurement out of range: {0}cm")]
    OutOfRange(f32),
    #[error("Hardware lock contention")]
    LockContention,
}

/// SPI通信の抽象化trait（テスト用）
pub trait SpiInterface: Send + Sync {
    fn transfer(&mut self, read: &mut [u8], write: &[u8]) -> Result<(), SensorError>;
}

/// 実際のSPI実装
pub struct RppalSpiAdapter {
    spi: Spi,
}

impl RppalSpiAdapter {
    pub fn new() -> Result<Self> {
        let spi = Spi::new(Bus::Spi0, SlaveSelect::Ss0, 100_000, Mode::Mode0)
            .context("Failed to initialize SPI")?;

        Ok(Self { spi })
    }
}

impl SpiInterface for RppalSpiAdapter {
    fn transfer(&mut self, read: &mut [u8], write: &[u8]) -> Result<(), SensorError> {
        self.spi.transfer(read, write).map_err(SensorError::from)
    }
}

/// 距離キャリブレーションテーブル
#[derive(Debug, Clone)]
pub struct DistanceCalibrationTable {
    /// (距離cm, 電圧V)のペア
    points: Vec<(f32, f32)>,
}

impl Default for DistanceCalibrationTable {
    fn default() -> Self {
        Self {
            points: vec![
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
            ],
        }
    }
}

impl DistanceCalibrationTable {
    /// 電圧から距離を線形補間で計算
    #[instrument(skip(self), level = "debug")]
    pub fn voltage_to_distance(&self, voltage: f32) -> f32 {
        for i in 0..self.points.len() - 1 {
            let (dist1, volt1) = self.points[i];
            let (dist2, volt2) = self.points[i + 1];

            if voltage <= volt1 && voltage >= volt2 {
                // 線形補間
                let volt_range = volt1 - volt2;
                let dist_range = dist2 - dist1;
                let volt_offset = volt1 - voltage;

                let distance = dist1 + (volt_offset / volt_range) * dist_range;
                debug!(
                    "Interpolated distance: {:.2}cm from voltage: {:.3}V",
                    distance, voltage
                );
                return distance;
            }
        }

        // 範囲外の場合
        if voltage > self.points[0].1 {
            debug!(
                "Voltage too high: {:.3}V, returning minimum distance",
                voltage
            );
            self.points[0].0 - 1.0
        } else {
            debug!(
                "Voltage too low: {:.3}V, returning maximum distance",
                voltage
            );
            self.points[self.points.len() - 1].0 + 10.0
        }
    }
}

impl Default for SensorConfig {
    fn default() -> Self {
        Self {
            channel: MCP3002Channel::Channel1,
            reference_voltage: 3.3,
            threshold_distance: 30.0,
            measurement_count: 3,
            measurement_interval: 10,
        }
    }
}

/// SHARP GP2Y0A21YK0F 赤外線測距センサー + MCP3002 A/Dコンバーター
pub struct Gp2y0aDistanceSensor<T: SpiInterface> {
    spi: Mutex<T>,
    config: SensorConfig,
    calibration_table: DistanceCalibrationTable,
}

impl<T: SpiInterface> Gp2y0aDistanceSensor<T> {
    /// 新しい距離センサーインスタンスを作成
    pub fn new_with_config(spi: T, config: SensorConfig) -> Self {
        Self {
            spi: Mutex::new(spi),
            config,
            calibration_table: DistanceCalibrationTable::default(),
        }
    }

    /// カスタムキャリブレーションテーブルで作成
    pub fn new_with_calibration(
        spi: T,
        config: SensorConfig,
        calibration: DistanceCalibrationTable,
    ) -> Self {
        Self {
            spi: Mutex::new(spi),
            config,
            calibration_table: calibration,
        }
    }

    /// MCP3002からA/D変換値を読み取り
    #[instrument(skip(self), level = "debug")]
    fn read_adc(&self) -> Result<u16, SensorError> {
        let mut spi = self.spi.lock().map_err(|_| SensorError::LockContention)?;

        // MCP3002のコマンド形式
        let cmd = 0x40 + ((2 + self.config.channel as u8) << 4) + 8;

        let tx_buf = [cmd, 0x00];
        let mut rx_buf = [0u8; 2];

        spi.transfer(&mut rx_buf, &tx_buf)?;

        // 10ビットのA/D変換値を抽出
        let value = ((rx_buf[0] as u16) << 8 | rx_buf[1] as u16) & 0x3ff;

        debug!("ADC raw value: {}, cmd: 0x{:02x}", value, cmd);

        Ok(value)
    }

    /// A/D変換値を電圧に変換
    fn adc_to_voltage(&self, adc_value: u16) -> f32 {
        (adc_value as f32) / 1023.0 * self.config.reference_voltage
    }

    /// 距離を測定（内部実装）
    #[instrument(skip(self), level = "debug")]
    async fn measure_distance_internal(&self) -> Result<f32> {
        let mut measurements = Vec::new();

        for _ in 0..self.config.measurement_count {
            let adc_value = self
                .read_adc()
                .map_err(|e| anyhow!("ADC read failed: {}", e))?;
            let voltage = self.adc_to_voltage(adc_value);
            let distance = self.calibration_table.voltage_to_distance(voltage);

            measurements.push(distance);

            sleep(Duration::from_millis(self.config.measurement_interval)).await;
        }

        // 中央値を使用（ノイズ対策）
        measurements.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median = measurements[measurements.len() / 2];

        debug!(
            "Distance measurements: {:?}, median: {:.2}cm",
            measurements, median
        );

        // 測定値が有効範囲外の場合は警告
        if median < DISTANCE_SENSOR_MIN_VALID_RANGE || median > DISTANCE_SENSOR_MAX_VALID_RANGE {
            warn!(
                "Distance sensor reading out of valid range: {:.2}cm",
                median
            );
        }

        Ok(median)
    }
}

// 便利コンストラクタ
impl Gp2y0aDistanceSensor<RppalSpiAdapter> {
    /// デフォルト設定で新しいインスタンスを作成
    pub fn new() -> Result<Self> {
        let channel = DOOR_SENSOR_MCP3002_CHANNEL;
        let threshold_distance = DOOR_SENSOR_THRESHOLD_DISTANCE;

        let config = SensorConfig {
            channel,
            threshold_distance,
            ..Default::default()
        };

        let spi = RppalSpiAdapter::new()?;

        Ok(Self::new_with_config(spi, config))
    }
}

impl<T: SpiInterface> DoorSensor for Gp2y0aDistanceSensor<T> {
    fn is_door_open(&self) -> Pin<Box<dyn Future<Output = Result<bool>> + Send + '_>> {
        Box::pin(async move {
            let distance = self.measure_distance_internal().await?;

            let is_open = distance < self.config.threshold_distance;

            debug!(
                "Door sensor: distance={:.2}cm, threshold={:.2}cm, is_open={}",
                distance, self.config.threshold_distance, is_open
            );

            Ok(is_open)
        })
    }

    fn measure_distance(&self) -> Pin<Box<dyn Future<Output = Result<f32>> + Send + '_>> {
        Box::pin(async move { self.measure_distance_internal().await })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    /// テスト用のモックSPI実装
    #[derive(Debug)]
    pub struct MockSpiInterface {
        responses: Mutex<VecDeque<Result<[u8; 2], SensorError>>>,
    }

    impl MockSpiInterface {
        pub fn new(responses: Vec<Result<[u8; 2], SensorError>>) -> Self {
            Self {
                responses: Mutex::new(responses.into()),
            }
        }
    }

    impl SpiInterface for MockSpiInterface {
        fn transfer(&mut self, read: &mut [u8], _write: &[u8]) -> Result<(), SensorError> {
            let response = self
                .responses
                .get_mut()
                .unwrap()
                .pop_front()
                .unwrap_or(Err(SensorError::SpiError(rppal::spi::Error::Io(
                    std::io::Error::new(
                        std::io::ErrorKind::UnexpectedEof,
                        "No more mock responses",
                    ),
                ))))?;

            read[0] = response[0];
            read[1] = response[1];
            Ok(())
        }
    }

    #[test]
    fn test_voltage_to_distance() {
        let table = DistanceCalibrationTable::default();

        // テストケース
        assert!((table.voltage_to_distance(2.25) - 10.0).abs() < 2.0);
        assert!((table.voltage_to_distance(1.3) - 20.0).abs() < 2.0);
        assert!((table.voltage_to_distance(0.6) - 50.0).abs() < 5.0);
    }

    #[test]
    fn test_adc_to_voltage() {
        let config = SensorConfig::default();
        let mock_spi = MockSpiInterface::new(vec![]);
        let sensor = Gp2y0aDistanceSensor::new_with_config(mock_spi, config);

        assert!((sensor.adc_to_voltage(0) - 0.0).abs() < 0.01);
        assert!((sensor.adc_to_voltage(1023) - 3.3).abs() < 0.01);
        assert!((sensor.adc_to_voltage(512) - 1.65).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_mock_distance_measurement() {
        // 10cmに相当するADC値（約700）をモック
        let adc_high = (700u16 >> 2) as u8;
        let adc_low = ((700u16 & 0xff) << 6) as u8;

        let mock_responses = vec![
            Ok([adc_high, adc_low]),
            Ok([adc_high, adc_low]),
            Ok([adc_high, adc_low]),
        ];

        let mock_spi = MockSpiInterface::new(mock_responses);
        let config = SensorConfig {
            measurement_count: 3,
            ..Default::default()
        };

        let sensor = Gp2y0aDistanceSensor::new_with_config(mock_spi, config);

        let distance = sensor.measure_distance().await;
        assert!(distance.is_ok());

        let distance_value = distance.unwrap();
        assert!(distance_value > 5.0 && distance_value < 15.0);
    }
}
