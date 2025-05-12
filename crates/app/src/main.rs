#![warn(clippy::all, clippy::pedantic)]
mod app;
mod config;
mod domain;
mod infra;
#[cfg(test)]
mod tests;

use anyhow::bail;
use app::TouchCardUseCase;
use clap::Parser;
use config::Config;
use domain::CardReader as _;
use futures_util::StreamExt as _;
use futures_util::stream::select_all;
use infra::{GpioDoorLock, HttpCardApi, PasoriReader, RodioPlayer, SystemClock};
use pasori::rusb::{Context as RusbContext, UsbContext};
use tracing::{error, info};

const VENDOR_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .init();

    let config = Config::parse();

    info!("Starting application...");
    info!("Application version: {}", env!("CARGO_PKG_VERSION"));

    info!("Initializing API client with endpoint: {}", config.api_path);
    let api = HttpCardApi::new(config.api_path, config.api_token)?;
    info!("API client initialized successfully");

    info!("Initializing sound player");
    let player = RodioPlayer::new()?;
    info!("Sound player initialized successfully");

    info!("Initializing system clock");
    let clock = SystemClock::new();

    info!("Spawning Pasori card readers");
    let readers = RusbContext::new()?
        .devices()?
        .iter()
        .filter(|dev| {
            let Ok(dev_desc) = dev.device_descriptor() else {
                return false;
            };

            dev_desc.vendor_id() == VENDOR_ID && dev_desc.product_id() == PRODUCT_ID
        })
        .map(|dev| PasoriReader::spawn(dev).map(|reader| reader.into_stream().boxed()))
        .collect::<Result<Vec<_>, _>>()?;
    if readers.is_empty() {
        bail!("No Pasori reader found");
    }
    let mut readers = select_all(readers);
    info!("Card readers spawned successfully");

    info!("Spawning door lock");
    let door_lock = GpioDoorLock::spawn().await?;
    info!("Door lock spawned successfully");

    info!("Creating TouchCardUseCase");
    let touch_card_use_case = TouchCardUseCase::new(api, player, clock, door_lock);

    info!("Starting card reader loop");
    while let Some(card) = readers.next().await {
        let card = card?;
        info!("Card scanned: {:?}", card);
        if let Err(e) = touch_card_use_case.execute(&card).await {
            error!("Error processing card: {}", e);
        }
        info!("Card processing completed");
    }

    info!("Card reader stopped, exiting application");
    Ok(())
}
