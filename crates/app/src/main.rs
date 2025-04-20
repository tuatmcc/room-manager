mod reader;

use std::{io::Cursor, time::Duration};

use reader::{
    open_reader, scan_student_card, scan_suica_card, wait_for_student_card_release,
    wait_for_suica_card_release,
};
use rodio::{Decoder, OutputStream, Sink, Source};
use serde::{Deserialize, Serialize};
use tokio::time;
use tracing::info;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct TouchStudentCardRequest {
    student_id: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum RoomEntryStatus {
    Entry,
    Exit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum TouchCardResponse {
    Success { status: RoomEntryStatus },
    Error { error: String },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let mut reader = open_reader()?;
    let client = reqwest::Client::new();
    let (_stream, stream_handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&stream_handle)?;

    loop {
        if let Some((card, student_id)) = scan_student_card(&mut reader)? {
            info!("Student card detected: {:?}", student_id);

            let res = client
                .post("https://dev.s2n.tech/local-device/touch-student-card")
                .json(&TouchStudentCardRequest { student_id })
                .send()
                .await?
                .json::<TouchCardResponse>()
                .await?;

            match res {
                TouchCardResponse::Success { status } => {
                    info!("Student card touched successfully: {:?}", status);
                    let buf = match status {
                        RoomEntryStatus::Entry => include_bytes!("./sounds/hello.wav").as_slice(),
                        RoomEntryStatus::Exit => include_bytes!("./sounds/goodbye.wav").as_slice(),
                    };
                    let reader = Cursor::new(buf);
                    let source = Decoder::new(reader)?;
                    sink.append(source);
                    info!("Playing sound");
                }
                TouchCardResponse::Error { error } => {
                    info!("Error touching student card: {:?}", error);
                }
            }

            wait_for_student_card_release(&mut reader, &card)?;
        };
        if let Some((card, suica_idm)) = scan_suica_card(&mut reader)? {
            info!("Suica card detected: {:?}", suica_idm);
            time::sleep(Duration::from_secs(1)).await;
            wait_for_suica_card_release(&mut reader, &card)?;
        }
    }
}
