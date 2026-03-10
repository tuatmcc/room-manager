#![warn(clippy::all, clippy::pedantic)]
mod config;
mod infra;
mod runtime;

use clap::Parser;
use config::Config;
use futures_util::StreamExt as _;
use futures_util::stream::select_all;
use infra::{HttpCardApi, SystemClock};
use room_manager::app::TouchCardUseCase;
use runtime::{new_sound_player, spawn_door_lock, spawn_readers};
use tracing::{error, info};

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
        "starting room-manager app"
    );

    let api = HttpCardApi::new(config.api_path, config.api_token)?;
    info!("initialized api client");

    let player = new_sound_player()?;
    info!("initialized sound player");

    let clock = SystemClock::new();
    info!("initialized system clock");

    let readers = spawn_readers()?;
    let mut readers = select_all(readers);
    info!("spawned card readers");

    let door_lock = spawn_door_lock().await?;
    info!("spawned door lock");

    let touch_card_use_case = TouchCardUseCase::new(api, player, clock, door_lock);

    info!("starting card reader loop");
    while let Some(card) = readers.next().await {
        let card = card?;
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
