#![warn(clippy::all, clippy::pedantic)]
mod app;
mod domain;
mod infra;
#[cfg(test)]
mod tests;

use app::TouchCardUseCase;
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
    let player = match RodioPlayer::new() {
        Ok(player) => {
            info!("Sound player initialized successfully");
            player
        }
        Err(e) => {
            error!("Failed to initialize sound player: {}", e);
            return Err(e);
        }
    };

    info!("Initializing system clock");
    let clock = SystemClock::new();

    info!("Spawning Pasori card reader");
    let reader = match PasoriReader::spawn() {
        Ok(reader) => {
            info!("Card reader spawned successfully");
            reader
        }
        Err(e) => {
            error!("Failed to spawn card reader: {}", e);
            return Err(e);
        }
    };

    info!("Initialized card reader, API client, and sound player");
    info!("Ready to scan cards");

    // ユースケースに注入して実行
    info!("Creating and starting TouchCardUseCase");
    let mut use_case = TouchCardUseCase::new(reader, api, player, clock);

    match use_case.run_loop().await {
        Ok(()) => {
            info!("Application terminated normally");
            Ok(())
        }
        Err(e) => {
            error!("Application terminated with error: {}", e);
            Err(e)
        }
    }
}
