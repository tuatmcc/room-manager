# ドア開閉検知システム

SHARP GP2Y0A21YK0F 赤外線測距センサーとMCP3002 A/Dコンバーターを使用したドアの開閉状態検知システムです。

## ハードウェア構成

### 必要な部品
- Raspberry Pi（SPI有効化済み）
- SHARP GP2Y0A21YK0F 赤外線測距センサー
- MCP3002 SPI接続A/Dコンバーター
- ブレッドボード
- ジャンパーワイヤー

### 配線

#### MCP3002とRaspberry Piの接続
| MCP3002ピン | 機能 | Raspberry Pi |
|-------------|------|--------------|
| 1 (CS) | Chip Select | CE0 (24番ピン) |
| 2 (CH0) | アナログ入力0 | （使用しない） |
| 3 (CH1) | アナログ入力1 | GP2Y0A白線 |
| 4 (GND) | グランド | GND (6番ピン等) |
| 5 (Din) | データ入力 | MOSI (19番ピン) |
| 6 (Dout) | データ出力 | MISO (21番ピン) |
| 7 (CLK) | クロック | SCLK (23番ピン) |
| 8 (Vdd/Vref) | 電源/参照電圧 | 3.3V (1番ピン等) |

#### GP2Y0A21YK0Fとの接続
| GP2Y0A線色 | 機能 | 接続先 |
|------------|------|--------|
| 黒 | 電源 | Raspberry Pi 5V (2番または4番ピン) |
| オレンジ | GND | Raspberry Pi GND |
| 白 | 出力 | MCP3002 CH1 (3番ピン) |

## ソフトウェア

### 使用方法

1. **基本的な使用例**
```rust
use room_manager::domain::DoorSensor;
use room_manager::infra::Gp2y0aDistanceSensor;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // チャンネル1、閾値30cmでセンサー初期化
    let sensor = Gp2y0aDistanceSensor::new(1, 30.0)?;
    
    // ドア開閉状態をチェック
    let is_open = sensor.is_door_open().await?;
    println!("ドア状態: {}", if is_open { "開" } else { "閉" });
    
    // 距離測定
    let distance = sensor.measure_distance().await?;
    println!("測定距離: {:.2}cm", distance);
    
    Ok(())
}
```

2. **カスタム設定での使用例**
```rust
use room_manager::infra::{
    Gp2y0aDistanceSensor, RppalSpiAdapter, SensorConfig, MCP3002Channel,
    DistanceCalibrationTable
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // カスタム設定
    let config = SensorConfig {
        channel: MCP3002Channel::Channel0,
        reference_voltage: 3.3,
        threshold_distance: 25.0,
        measurement_count: 5,
        measurement_interval: 20,
    };
    
    // SPI初期化
    let spi_adapter = RppalSpiAdapter::new()?;
    
    // センサー作成
    let sensor = Gp2y0aDistanceSensor::new_with_config(spi_adapter, config);
    
    // カスタムキャリブレーションテーブルも使用可能
    let custom_calibration = DistanceCalibrationTable::default();
    let sensor_with_calibration = Gp2y0aDistanceSensor::new_with_calibration(
        spi_adapter, 
        config, 
        custom_calibration
    );
    
    Ok(())
}
```

3. **テスト用モック実装**
```rust
use room_manager::infra::{SpiInterface, SensorError, Gp2y0aDistanceSensor, SensorConfig};

// テスト用のモックSPI
struct MockSpi;
impl SpiInterface for MockSpi {
    fn transfer(&mut self, read: &mut [u8], _write: &[u8]) -> Result<(), SensorError> {
        // モックデータを返す
        read[0] = 0x02;  // 高位バイト
        read[1] = 0xBC;  // 低位バイト（約700の10ビット値）
        Ok(())
    }
}

#[tokio::test]
async fn test_with_mock() {
    let config = SensorConfig::default();
    let mock_spi = MockSpi;
    let sensor = Gp2y0aDistanceSensor::new_with_config(mock_spi, config);
    
    let distance = sensor.measure_distance().await.unwrap();
    assert!(distance > 0.0);
}
```

2. **サンプルプログラムの実行**
```bash
cd crates/app
cargo run --example door_detection
```

### 設定パラメータ

- **チャンネル**: MCP3002のチャンネル番号（0または1）
- **閾値距離**: ドア開閉判定の閾値（cm）
  - この値より近い距離で物体を検知した場合、ドアが開いていると判定

### 測定仕様

- **測定範囲**: 10cm〜80cm（GP2Y0A21YK0Fの仕様）
- **分解能**: 10ビット（0〜1023）
- **精度**: ±15%程度（個体差、環境による）
- **応答時間**: 約39ms

### 注意事項

1. **環境要因**
   - 直射日光、蛍光灯などの強い光源の影響を受ける場合があります
   - 黒い物体や透明な物体は検知しにくい場合があります

2. **キャリブレーション**
   - 個体差により測定値にばらつきがあります
   - 正確な距離測定が必要な場合は、実際の距離でキャリブレーションを行ってください

3. **電源要件**
   - GP2Y0A21YK0Fは5V電源が必要です
   - MCP3002は3.3V電源で動作し、参照電圧としても使用されます

## トラブルシューティング

### よくある問題

1. **「No such device」エラー**
   - SPI機能が有効になっているか確認してください
   - `sudo raspi-config` → Interfacing Options → SPI → Enable

2. **測定値が不安定**
   - 配線を確認してください
   - センサーの設置位置を調整してください
   - 環境光の影響を減らしてください

3. **距離が正しく測定されない**
   - 測定対象が有効範囲（10cm〜80cm）内にあるか確認してください
   - センサーの向きを調整してください

### デバッグ

トレーシングログを有効にして詳細な情報を確認できます：

```bash
RUST_LOG=debug cargo run --example door_detection
```

## ライセンス

このプロジェクトのライセンスに従います。
