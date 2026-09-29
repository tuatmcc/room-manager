#![warn(clippy::all, clippy::pedantic)]
mod config;
mod infra;
mod runtime;

use clap::Parser;
use config::Config;
use futures_util::StreamExt as _;
use infra::{HttpCardApi, SystemClock};
use room_manager::app::TouchCardUseCase;
use runtime::{ReaderEvent, new_sound_player, spawn_door_lock, spawn_readers};
use std::{env, fs, path::PathBuf};
use tracing::{error, info};

fn signal_container_ready() -> anyhow::Result<()> {
    let Some(ready_file) = env::var_os("ROOM_MANAGER_READY_FILE") else {
        return Ok(());
    };

    let ready_file = PathBuf::from(ready_file);
    let temporary_file = ready_file.with_extension(format!("{}.tmp", std::process::id()));
    fs::write(&temporary_file, format!("{}\n", std::process::id()))?;
    fs::rename(temporary_file, ready_file)?;
    info!("signaled container readiness");

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .init();

    let config = Config::parse();
    info!(
        version = env!("CARGO_PKG_VERSION"),
        api_path = %config.api_path,
        servo_direction = ?config.servo_direction,
        "starting room-manager app"
    );

    let api = HttpCardApi::new(config.api_path, config.api_token)?;
    info!("initialized api client");

    let player = new_sound_player()?;
    info!("initialized sound player");

    let clock = SystemClock::new();
    info!("initialized system clock");

    let mut readers = spawn_readers()?;
    info!("spawned card readers");

    let door_lock = spawn_door_lock(config.servo_direction).await?;
    info!("spawned door lock");

    let touch_card_use_case = TouchCardUseCase::new(api, player, clock, door_lock);

    match readers.next().await.transpose()? {
        Some(ReaderEvent::Ready) => {}
        Some(ReaderEvent::Card(_)) => {
            anyhow::bail!("received a card event before reader initialization completed");
        }
        None => anyhow::bail!("card reader stream ended before initialization completed"),
    }
    signal_container_ready()?;
    info!("starting card reader loop");
    while let Some(event) = readers.next().await {
        let ReaderEvent::Card(card) = event? else {
            continue;
        };
        info!(
            idm = %card.idm,
            student_id = ?card.student_id,
            balance = ?card.balance,
            "received card event"
        );
        if let Err(error) = touch_card_use_case.execute(&card).await {
            error!(
                idm = %card.idm,
                student_id = ?card.student_id,
                balance = ?card.balance,
                error = %error,
                "failed to process card event"
            );
        }
    }

    info!("card reader loop finished");
    Ok(())
}
