use std::{pin::Pin, sync::Arc, time::Duration};

use room_manager::domain::DoorLock;
use rppal::gpio::{Gpio, OutputPin};
use tokio::{
    sync::{Mutex, mpsc},
    time::{self, Sleep},
};
use tracing::{error, info};

const SERVO_PIN: u8 = 18;
const SERVO_PERIOD: Duration = Duration::from_millis(20);

// 0.5ms ~ 2.5ms
const SERVO_MIN_DUTY_CYCLE_US: u64 = 500;
const SERVO_MAX_DUTY_CYCLE_US: u64 = 2500;

const SERVO_MIN_ANGLE: u16 = 0;
const SERVO_MAX_ANGLE: u16 = 180;

const LOCK_ANGLE: u16 = 0;
const UNLOCK_ANGLE: u16 = 180;
const NEUTRAL_ANGLE: u16 = 90;

const SERVO_MOVE_WAIT_TIME: Duration = Duration::from_secs(1);
const AUTO_LOCK_DELAY: Duration = Duration::from_secs(30);

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
        info!("initialized gpio door lock");

        Ok(door_lock)
    }

    async fn unlock(&mut self) -> anyhow::Result<()> {
        info!("unlocking door");
        self.set_unlock_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.set_neutral_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.output_pin.clear_pwm()?;
        self.is_unlocked = true;
        info!("door unlocked");

        Ok(())
    }

    async fn lock(&mut self) -> anyhow::Result<()> {
        if !self.is_unlocked {
            return Ok(());
        }

        info!("locking door");
        self.set_lock_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.set_neutral_angle()?;
        time::sleep(SERVO_MOVE_WAIT_TIME).await;
        self.output_pin.clear_pwm()?;
        self.is_unlocked = false;
        info!("door locked");

        Ok(())
    }

    fn set_angle(&mut self, angle: u16) -> anyhow::Result<()> {
        anyhow::ensure!(
            angle <= SERVO_MAX_ANGLE,
            "servo angle must be between {SERVO_MIN_ANGLE} and {SERVO_MAX_ANGLE}: {angle}"
        );

        let duty_cycle_us = SERVO_MIN_DUTY_CYCLE_US
            + (SERVO_MAX_DUTY_CYCLE_US - SERVO_MIN_DUTY_CYCLE_US) * u64::from(angle)
                / u64::from(SERVO_MAX_ANGLE);

        self.output_pin
            .set_pwm(SERVO_PERIOD, Duration::from_micros(duty_cycle_us))?;

        Ok(())
    }

    fn set_lock_angle(&mut self) -> anyhow::Result<()> {
        self.set_angle(LOCK_ANGLE)
    }

    fn set_unlock_angle(&mut self) -> anyhow::Result<()> {
        self.set_angle(UNLOCK_ANGLE)
    }

    fn set_neutral_angle(&mut self) -> anyhow::Result<()> {
        self.set_angle(NEUTRAL_ANGLE)
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
                // unlockされたら30秒後にlockする
                // ただし、30秒以内に別のメッセージが来たらその30秒後にlockをする。
                let mut timer: Option<Pin<Box<Sleep>>> = None;
                loop {
                    tokio::select! {
                        msg = rx_unlock.recv() => {
                            match msg {
                                Some(()) => {
                                    info!("scheduled auto-lock");
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
                            let mut door_lock = internal.lock().await;
                            if let Err(error) = door_lock.lock().await {
                                error!(error = %error, "failed to auto-lock door");
                            } else {
                                info!("auto-lock completed");
                            }
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
        info!("received unlock request");
        self.tx_unlock.send(()).await?;
        self.internal.lock().await.unlock().await
    }
}
