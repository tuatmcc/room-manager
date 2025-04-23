#![warn(clippy::all, clippy::pedantic)]
mod app;
mod domain;
mod infra;
#[cfg(test)]
mod tests;

use app::TouchCardUseCase;
use domain::CardReader as _;
use infra::{HttpCardApi, PasoriReader, RodioPlayer, SystemClock};
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .init();

    info!("Starting application...");
    info!("Application version: {}", env!("CARGO_PKG_VERSION"));

    info!("Initializing API client with endpoint: https://dev.s2n.tech/local-device");
    let api = HttpCardApi::new("https://dev.s2n.tech/local-device", 5);
    info!("API client initialized successfully");

    info!("Initializing sound player");
    let player = RodioPlayer::new()?;
    info!("Sound player initialized successfully");

    info!("Initializing system clock");
    let clock = SystemClock::new();

    info!("Spawning Pasori card reader");
    let mut reader = PasoriReader::spawn()?;
    info!("Card reader spawned successfully");

    info!("Initialized card reader, API client, and sound player");

    info!("Creating TouchCardUseCase");
    let touch_card_use_case = TouchCardUseCase::new(api, player, clock);

    info!("Starting card reader loop");
    while let Some(card_id) = reader.next().await? {
        info!("Card scanned: {:?}", card_id);
        if let Err(e) = touch_card_use_case.execute(&card_id).await {
            error!("Error processing card: {}", e);
        }
        info!("Card processing completed");
    }

    info!("Card reader stopped, exiting application");
    Ok(())
}
