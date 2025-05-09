use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::domain::ServoController;
use rppal::gpio::{Gpio, OutputPin};

#[derive(Clone)]
pub struct KeyController {
    pin: Arc<Mutex<OutputPin>>,
}

impl KeyController {
    pub fn new(gpio_pin: u8) -> anyhow::Result<Self> {
        let gpio = Gpio::new()?;
        let mut pin = gpio.get(gpio_pin)?.into_output();

        // 初期位置（閉じてる状態）に設定
        pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_micros(1500),
        )?;

        Ok(Self {
            pin: Arc::new(Mutex::new(pin)),
        })
    }
}

impl ServoController for KeyController {
    fn open(&self) -> anyhow::Result<()> {
        let mut pin = self.pin.lock().unwrap();
        // 鍵を開ける(90度回したあと-90度回して戻す)
        pin.set_pwm(Duration::from_nanos(20_000_000), Duration::from_micros(500))?;
        std::thread::sleep(Duration::from_millis(1000));
        pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_micros(1500),
        )?;
        Ok(())
    }

    fn close(&self) -> anyhow::Result<()> {
        let mut pin = self.pin.lock().unwrap();
        // 鍵を閉じる(-90度回したあと90度回して戻す)
        pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_micros(2500),
        )?;
        std::thread::sleep(Duration::from_millis(1000));
        pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_micros(1500),
        )?;
        Ok(())
    }
}
