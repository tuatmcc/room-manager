use std::{pin::Pin, sync::Arc, time::Duration};

use crate::domain::DoorLock;
use rppal::gpio::{Gpio, OutputPin};
use tokio::{
    sync::{Mutex, mpsc},
    time::{self, Sleep},
};

const SERVO_PIN: u8 = 18;
const SERVO_PERIOD: Duration = Duration::from_millis(20);
// 0.5ms ~ 2.5ms
const SERVO_MIN_DUTY_CYCLE: Duration = Duration::from_micros(500);
const SERVO_MAX_DUTY_CYCLE: Duration = Duration::from_micros(2500);

const SERVO_MOVE_WAIT_TIME: Duration = Duration::from_secs(1);
const AUTO_LOCK_DELAY: Duration = Duration::from_secs(10);

#[derive(Debug)]
struct DoorLockInternal {
    is_unlocked: bool,
    output_pin: OutputPin,
}

impl DoorLockInternal {
    async fn new() -> anyhow::Result<Self> {
        let output_pin = Gpio::new()?.get(SERVO_PIN)?.into_output();

        let mut door_lock = Self {
            is_unlocked: true,
            output_pin,
        };
        door_lock.lock().await?;

        Ok(door_lock)
    }

    async fn unlock(&mut self) -> anyhow::Result<()> {
        if self.is_unlocked {
            return Ok(());
        }

        self.set_unlock_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.set_neutral_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.output_pin.clear_pwm()?;
        self.is_unlocked = true;

        Ok(())
    }

    async fn lock(&mut self) -> anyhow::Result<()> {
        if !self.is_unlocked {
            return Ok(());
        }

        self.set_lock_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.set_neutral_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.output_pin.clear_pwm()?;
        self.is_unlocked = false;

        Ok(())
    }

    // 180度にセット
    fn set_lock_angle(&mut self) -> anyhow::Result<()> {
        self.output_pin
            .set_pwm(SERVO_PERIOD, SERVO_MAX_DUTY_CYCLE)?;

        Ok(())
    }

    // 0度にセット
    fn set_unlock_angle(&mut self) -> anyhow::Result<()> {
        self.output_pin
            .set_pwm(SERVO_PERIOD, SERVO_MIN_DUTY_CYCLE)?;

        Ok(())
    }

    // 90度にセット
    fn set_neutral_angle(&mut self) -> anyhow::Result<()> {
        self.output_pin.set_pwm(
            SERVO_PERIOD,
            (SERVO_MIN_DUTY_CYCLE + SERVO_MAX_DUTY_CYCLE) / 2,
        )?;

        Ok(())
    }
}

#[derive(Debug)]
pub struct GpioDoorLock {
    internal: Arc<Mutex<DoorLockInternal>>,
    tx_unlock: mpsc::Sender<()>,
}

impl GpioDoorLock {
    pub async fn spawn() -> anyhow::Result<Self> {
        let internal = DoorLockInternal::new().await?;
        let internal = Arc::new(Mutex::new(internal));

        let (tx_unlock, mut rx_unlock) = mpsc::channel(1);

        let lock = Self {
            internal: Arc::clone(&internal),
            tx_unlock,
        };

        {
            let internal = Arc::clone(&internal);
            tokio::spawn(async move {
                // unlockされたら10秒後にlockする
                // ただし、10秒以内に別のメッセージが来たらその10秒後にlockをする。
                let mut timer: Option<Pin<Box<Sleep>>> = None;
                loop {
                    tokio::select! {
                        msg = rx_unlock.recv() => {
                            match msg {
                                Some(()) => {
                                    timer = Some(Box::pin(time::sleep(AUTO_LOCK_DELAY)));
                                },
                                None => break,
                            }
                        },
                        () = async {
                            if let Some(ref mut timer) = timer.as_mut() {
                                timer.await;
                            }
                        }, if timer.is_some() => {
                            let _ = internal.lock().await.lock().await;
                            timer = None;
                        }
                    }
                }
            });
        }

        Ok(lock)
    }
}

impl DoorLock for GpioDoorLock {
    async fn unlock(&self) -> anyhow::Result<()> {
        self.tx_unlock.send(()).await?;
        self.internal.lock().await.unlock().await
    }
}
