mod reader;

use std::io::Cursor;

use reader::{open_reader, scan_card, wait_for_release};
use reqwest::Client;
use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
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
    let (_stream, stream_handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&stream_handle)?;

    loop {
        let Some(detected) = scan_card(&mut reader)? else {
            continue;
        };

        handle_card(&client, &sink, &detected.kind).await?;

        wait_for_release(&mut reader, &detected.card, &detected.kind)?;
    }
}

async fn handle_card(client: &Client, sink: &Sink, kind: &CardKind) -> anyhow::Result<()> {
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

    if let TouchCardResponse::Success { status } = res {
        info!("Card touched successfully: {:?}", status);
        let buf = match status {
            RoomEntryStatus::Entry => include_bytes!("./sounds/hello.wav").as_slice(),
            RoomEntryStatus::Exit => include_bytes!("./sounds/goodbye.wav").as_slice(),
        };
        let reader = Cursor::new(buf);
        let source = Decoder::new(reader)?;
        sink.append(source);
        info!("Playing sound");
    } else {
        info!("Error touching card: {:?}", res);
    }

    Ok(())
}
