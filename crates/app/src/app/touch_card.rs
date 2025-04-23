use crate::domain::{
    CardApi, CardId, CardReader, Clock, ErrorCode, RoomEntryStatus, SoundEvent, SoundPlayer,
    TouchCardRequest, TouchCardResponse,
};
use chrono::Timelike;

pub struct TouchCardUseCase<R, A, P, C>
where
    R: CardReader,
    A: CardApi,
    P: SoundPlayer,
    C: Clock,
{
    reader: R,
    api: A,
    player: P,
    clock: C,
}

impl<R, A, P, C> TouchCardUseCase<R, A, P, C>
where
    R: CardReader,
    A: CardApi,
    P: SoundPlayer,
    C: Clock,
{
    pub fn new(reader: R, api: A, player: P, clock: C) -> Self {
        Self {
            reader,
            api,
            player,
            clock,
        }
    }

    pub async fn run_loop(&mut self) -> anyhow::Result<()> {
        while let Some(card) = self.reader.next().await? {
            self.handle_card(&card)?;
        }

        Ok(())
    }

    pub fn handle_card(&self, card: &CardId) -> anyhow::Result<()> {
        let req: TouchCardRequest = card.clone().into();
        match self.api.touch(req)? {
            TouchCardResponse::Success { status, entries } => {
                self.play_success(status, entries)?;
            }
            TouchCardResponse::Error { error_code, .. } => {
                self.play_error(error_code)?;
            }
        }
        Ok(())
    }

    fn play_success(&self, status: RoomEntryStatus, entries: u32) -> anyhow::Result<()> {
        match status {
            RoomEntryStatus::Entry => {
                let now = self.clock.now();
                match now.hour() {
                    6..=11 => self.player.play(SoundEvent::GoodMorning)?,
                    12..=17 => self.player.play(SoundEvent::Hello)?,
                    _ => self.player.play(SoundEvent::GoodEvening)?,
                }
            }
            RoomEntryStatus::Exit => {
                self.player.play(SoundEvent::GoodBye)?;
                if entries == 0 {
                    self.player.play(SoundEvent::Last)?;
                }
            }
        }
        Ok(())
    }

    fn play_error(&self, error_code: ErrorCode) -> anyhow::Result<()> {
        match error_code {
            ErrorCode::StudentCardNotRegistered => {
                self.player.play(SoundEvent::RegisterStudentCard)?;
            }
            ErrorCode::SuicaCardNotRegistered => self.player.play(SoundEvent::RegisterSuicaCard)?,
            _ => self.player.play(SoundEvent::Error)?,
        }
        Ok(())
    }
}
