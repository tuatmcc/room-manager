mod reader;
mod sounds;

use chrono::{Local, Timelike};
use reader::{open_reader, scan_card, wait_for_release};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sounds::Player;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TouchCardRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    student_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    suica_idm: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum RoomEntryStatus {
    Entry,
    Exit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum ErrorCode {
    StudentCardAlreadyRegistered,
    SuicaCardAlreadyRegistered,
    StudentCardNotRegistered,
    SuicaCardNotRegistered,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum TouchCardResponse {
    Success {
        status: RoomEntryStatus,
    },
    Error {
        error: String,
        error_code: ErrorCode,
    },
}

pub enum CardKind {
    Student(u32),
    Suica(String),
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let mut reader = open_reader()?;
    let client = reqwest::Client::new();
    let player = Player::new()?;

    loop {
        let Some(detected) = scan_card(&mut reader)? else {
            continue;
        };

        handle_card(&client, &player, &detected.kind).await?;

        wait_for_release(&mut reader, &detected.card, &detected.kind).await?;
    }
}

async fn handle_card(client: &Client, player: &Player, kind: &CardKind) -> anyhow::Result<()> {
    let req = match kind {
        CardKind::Student(student_id) => TouchCardRequest {
            student_id: Some(*student_id),
            suica_idm: None,
        },
        CardKind::Suica(suica_idm) => TouchCardRequest {
            student_id: None,
            suica_idm: Some(suica_idm.clone()),
        },
    };

    let res = client
        .post("https://dev.s2n.tech/local-device/touch-card")
        .json(&req)
        .send()
        .await?
        .json::<TouchCardResponse>()
        .await?;

    match res {
        TouchCardResponse::Success { status } => {
            info!("Card touched successfully: {:?}", status);
            match status {
                RoomEntryStatus::Entry => {
                    let now = Local::now();
                    match now.hour() {
                        6..=11 => player.play(sounds::Sounds::GoodMorning)?,
                        12..=17 => player.play(sounds::Sounds::Hello)?,
                        _ => player.play(sounds::Sounds::GoodEvening)?,
                    }
                }
                RoomEntryStatus::Exit => player.play(sounds::Sounds::GoodBye)?,
            }
        }
        TouchCardResponse::Error { error, error_code } => {
            info!("Error touching card: {:?} {:?}", error, error_code);
            match error_code {
                ErrorCode::StudentCardNotRegistered => {
                    player.play(sounds::Sounds::RegisterStudentCard)?
                }
                ErrorCode::SuicaCardNotRegistered => {
                    player.play(sounds::Sounds::RegisterSuicaCard)?
                }
                _ => player.play(sounds::Sounds::Error)?,
            }
        }
    }

    Ok(())
}
