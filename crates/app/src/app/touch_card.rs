use crate::domain::{
    Card, CardApi, Clock, DoorLock, ErrorCode, RoomEntryStatus, SoundEvent, SoundPlayer,
    TouchCardRequest, TouchCardResponse,
};
use chrono::Timelike;
use tracing::{error, info};

pub struct TouchCardUseCase<A, P, C, D>
where
    A: CardApi,
    P: SoundPlayer,
    C: Clock,
    D: DoorLock,
{
    api: A,
    player: P,
    clock: C,
    door_lock: D,
}

impl<A, P, C, D> TouchCardUseCase<A, P, C, D>
where
    A: CardApi,
    P: SoundPlayer,
    C: Clock,
    D: DoorLock,
{
    pub fn new(api: A, player: P, clock: C, door_lock: D) -> Self {
        Self {
            api,
            player,
            clock,
            door_lock,
        }
    }

    /// Executes the touch-card workflow for a single scanned card.
    ///
    /// # Errors
    ///
    /// Returns an error if the API request fails, the selected sound cannot be
    /// queued, or the door lock operation fails.
    pub async fn execute(&self, card: &Card) -> anyhow::Result<()> {
        let req: TouchCardRequest = card.clone().into();
        info!(
            idm = %card.idm,
            student_id = ?card.student_id,
            balance = ?card.balance,
            "starting touch-card workflow"
        );

        self.player.reset();
        self.player.play(SoundEvent::Touch)?;

        let response = self.api.touch(req).await;
        let response = match response {
            Ok(response) => response,
            Err(error) => {
                error!(
                    idm = %card.idm,
                    student_id = ?card.student_id,
                    balance = ?card.balance,
                    error = %error,
                    "touch-card api call failed"
                );
                return Err(error);
            }
        };

        match response {
            TouchCardResponse::Success { status, entries } => {
                info!(?status, entries, "touch-card workflow succeeded");
                self.play_success(status, entries)?;
                self.door_lock.unlock().await?;
                info!(?status, entries, "completed touch-card success handling");
            }
            TouchCardResponse::Error { error_code, .. } => {
                info!(?error_code, "touch-card workflow returned business error");
                self.play_error(error_code)?;
            }
        }

        Ok(())
    }

    fn play_success(&self, status: RoomEntryStatus, entries: u32) -> anyhow::Result<()> {
        match status {
            RoomEntryStatus::Entry => {
                let now = self.clock.now();
                let hour = now.hour();
                match hour {
                    6..=11 => {
                        info!(hour, "playing morning greeting");
                        self.player.play(SoundEvent::GoodMorning)?;
                    }
                    12..=17 => {
                        info!(hour, "playing daytime greeting");
                        self.player.play(SoundEvent::Hello)?;
                    }
                    _ => {
                        info!(hour, "playing evening greeting");
                        self.player.play(SoundEvent::GoodEvening)?;
                    }
                }
            }
            RoomEntryStatus::Exit => {
                self.player.play(SoundEvent::GoodBye)?;
                if entries == 0 {
                    info!("playing last-person exit sound");
                    self.player.play(SoundEvent::Last)?;
                }
            }
        }
        Ok(())
    }

    fn play_error(&self, error_code: ErrorCode) -> anyhow::Result<()> {
        match error_code {
            ErrorCode::StudentCardNotRegistered => {
                info!("playing student-card registration guidance");
                self.player.play(SoundEvent::RegisterStudentCard)?;
            }
            ErrorCode::NfcCardNotRegistered => {
                info!("playing nfc-card registration guidance");
                self.player.play(SoundEvent::RegisterNfcCard)?;
            }
            _ => {
                info!(?error_code, "playing generic error sound");
                self.player.play(SoundEvent::Error)?;
            }
        }
        Ok(())
    }
}
