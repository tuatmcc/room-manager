use std::sync::Arc;

use crate::domain::{
    Card, CardApi, Clock, ErrorCode, I2cIrSensor, RoomEntryStatus, ServoController, SoundEvent, SoundPlayer, TouchCardRequest, TouchCardResponse
};
use chrono::Timelike;
use tracing::{info, warn};

pub struct TouchCardUseCase<A, P, C, Ir>
where
    A: CardApi,
    P: SoundPlayer,
    C: Clock,
    Ir: I2cIrSensor
{
    api: A,
    player: P,
    clock: C,
    servo: Arc<dyn ServoController + Send + Sync>,
    door_sensor: Ir,
}

impl<A, P, C, Ir> TouchCardUseCase<A, P, C, Ir>
where
    A: CardApi,
    P: SoundPlayer,
    C: Clock,
    Ir: I2cIrSensor,
{
    pub fn new(api: A, player: P, clock: C, servo: Arc<dyn ServoController + Send + Sync>, door_sensor: Ir) -> Self {
        Self { api, player, clock, servo, door_sensor }
    }

    
    pub async fn execute(&self, card: &Card) -> anyhow::Result<()> {
        let req: TouchCardRequest = card.clone().into();
        info!("Sending touch card request: {:?}", req);

        self.player.reset();
        self.player.play(SoundEvent::Touch)?;

        match self.api.touch(req).await? {
            TouchCardResponse::Success { status, entries } => {
                info!(
                    "Touch card success: status={:?}, entries={}",
                    status, entries
                );
                self.play_success(status, entries)?;
                self.servo.open()?; // 鍵を開ける

                // 自動閉鍵処理（30秒後に閉じる）
                let servo = self.servo.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    if let Err(e) = servo.close() {
                        warn!("Failed to close the door automatically: {:?}", e);
                    } else {
                        info!("Door closed automatically after timeout.");
                    }
                });
            }
            TouchCardResponse::Error { error_code, .. } => {
                warn!("Touch card error: error_code={:?}", error_code);
                self.play_error(error_code)?;
            }
        }

        let distance = self.door_sensor.read()?;
        info!("IR sensor distance: {}", distance);

        Ok(())
    }

    fn play_success(&self, status: RoomEntryStatus, entries: u32) -> anyhow::Result<()> {
        info!(
            "Playing success sound for status={:?}, entries={}",
            status, entries
        );
        match status {
            RoomEntryStatus::Entry => {
                let now = self.clock.now();
                let hour = now.hour();
                info!("Current hour is {}, selecting appropriate greeting", hour);
                match hour {
                    6..=11 => {
                        info!("Playing morning greeting");
                        self.player.play(SoundEvent::GoodMorning)?;
                    }
                    12..=17 => {
                        info!("Playing daytime greeting");
                        self.player.play(SoundEvent::Hello)?;
                    }
                    _ => {
                        info!("Playing evening greeting");
                        self.player.play(SoundEvent::GoodEvening)?;
                    }
                }
            }
            RoomEntryStatus::Exit => {
                info!("Playing goodbye sound");
                self.player.play(SoundEvent::GoodBye)?;
                if entries == 0 {
                    info!("Last person exiting, playing last person sound");
                    self.player.play(SoundEvent::Last)?;
                }
            }
        }
        Ok(())
    }

    fn play_error(&self, error_code: ErrorCode) -> anyhow::Result<()> {
        info!("Playing error sound for error_code={:?}", error_code);
        match error_code {
            ErrorCode::StudentCardNotRegistered => {
                info!("Student card not registered, playing registration guidance");
                self.player.play(SoundEvent::RegisterStudentCard)?;
            }
            ErrorCode::NfcCardNotRegistered => {
                info!("NFC card not registered, playing registration guidance");
                self.player.play(SoundEvent::RegisterNfcCard)?;
            }
            _ => {
                warn!("Unknown error occurred, playing generic error sound");
                self.player.play(SoundEvent::Error)?;
            }
        }
        Ok(())
    }
}
