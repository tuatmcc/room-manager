use std::collections::HashMap;

use async_stream::stream;
use futures_util::StreamExt as _;
use pasori::rusb::{Context as RusbContext, UsbContext};
use room_manager::domain::Card;
use tokio::{sync::mpsc, task::JoinHandle, time};
use tracing::{error, info, warn};

use crate::{
    infra::{GpioDoorLock, PasoriReader, RodioPlayer},
    runtime::CardStream,
};

const VENDOR_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

pub fn new_sound_player() -> anyhow::Result<RodioPlayer> {
    RodioPlayer::new()
}

pub async fn spawn_door_lock() -> anyhow::Result<GpioDoorLock> {
    GpioDoorLock::spawn().await
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct ReaderId {
    bus_number: u8,
    address: u8,
}

enum ReaderEvent {
    Card(Card),
    Stopped(ReaderId),
}

const READER_SCAN_INTERVAL: time::Duration = time::Duration::from_secs(1);

pub fn spawn_readers() -> anyhow::Result<CardStream> {
    let context = RusbContext::new()?;

    Ok(stream! {
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();
        let mut workers: HashMap<ReaderId, JoinHandle<()>> = HashMap::new();
        let mut reported_no_readers = false;
        let mut scan_interval = time::interval(READER_SCAN_INTERVAL);
        scan_interval.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                _ = scan_interval.tick() => {
                    let devices = match context.devices() {
                        Ok(devices) => devices,
                        Err(error) => {
                            error!(error = %error, "failed to enumerate usb devices");
                            continue;
                        }
                    };

                    let mut found_reader = false;
                    for device in devices.iter() {
                        let Ok(descriptor) = device.device_descriptor() else {
                            continue;
                        };
                        if descriptor.vendor_id() != VENDOR_ID || descriptor.product_id() != PRODUCT_ID {
                            continue;
                        }
                        found_reader = true;
                        reported_no_readers = false;

                        let id = ReaderId {
                            bus_number: device.bus_number(),
                            address: device.address(),
                        };
                        if workers.contains_key(&id) {
                            continue;
                        }

                        let reader = match PasoriReader::spawn(device) {
                            Ok(reader) => reader,
                            Err(error) => {
                                warn!(?id, error = ?error, "failed to initialize pasori reader; will retry");
                                continue;
                            }
                        };
                        info!(?id, "connected pasori reader");

                        let worker_tx = event_tx.clone();
                        let worker = tokio::spawn(async move {
                            let mut cards = reader.into_stream();
                            while let Some(result) = cards.next().await {
                                match result {
                                    Ok(card) => {
                                        if worker_tx.send(ReaderEvent::Card(card)).is_err() {
                                            return;
                                        }
                                    }
                                    Err(error) => {
                                        warn!(?id, error = ?error, "pasori reader stopped; waiting for reconnect");
                                        break;
                                    }
                                }
                            }
                            let _ = worker_tx.send(ReaderEvent::Stopped(id));
                        });
                        workers.insert(id, worker);
                    }

                    if !found_reader && workers.is_empty() && !reported_no_readers {
                        warn!("no Pasori reader found; waiting for connection");
                        reported_no_readers = true;
                    }
                }
                event = event_rx.recv() => {
                    match event {
                        Some(ReaderEvent::Card(card)) => yield Ok(card),
                        Some(ReaderEvent::Stopped(id)) => {
                            if let Some(worker) = workers.remove(&id) {
                                if let Err(error) = worker.await {
                                    error!(?id, error = ?error, "pasori reader task failed");
                                }
                            }
                            info!(?id, "disconnected pasori reader");
                        }
                        None => break,
                    }
                }
            }
        }
    }.boxed())
}
