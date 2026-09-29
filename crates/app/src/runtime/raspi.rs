use std::collections::HashMap;

use async_stream::stream;
use futures_util::StreamExt as _;
use pasori::rusb::{Context as RusbContext, UsbContext};
use room_manager::domain::Card;
use tokio::{sync::mpsc, task::JoinHandle, time};
use tracing::{error, info, warn};

use crate::config::ServoDirection;
use crate::{
    infra::{GpioDoorLock, PasoriReader, RodioPlayer},
    runtime::{ReaderEvent, ReaderStream},
};

const VENDOR_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

pub fn new_sound_player() -> anyhow::Result<RodioPlayer> {
    RodioPlayer::new()
}

pub async fn spawn_door_lock(servo_direction: ServoDirection) -> anyhow::Result<GpioDoorLock> {
    GpioDoorLock::spawn(servo_direction == ServoDirection::Reverse).await
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct ReaderId {
    bus_number: u8,
    address: u8,
}

enum ReaderWorkerEvent {
    Card(Card),
    Stopped(ReaderId),
}

const READER_SCAN_INTERVAL: time::Duration = time::Duration::from_secs(1);

struct ScanResult {
    found_reader: bool,
    initialized_reader: bool,
}

fn scan_readers(
    context: &RusbContext,
    event_tx: &mpsc::UnboundedSender<ReaderWorkerEvent>,
    workers: &mut HashMap<ReaderId, JoinHandle<()>>,
) -> anyhow::Result<ScanResult> {
    let devices = context.devices()?;
    let mut found_reader = false;
    let mut initialized_reader = false;

    for device in devices.iter() {
        let Ok(descriptor) = device.device_descriptor() else {
            continue;
        };
        if descriptor.vendor_id() != VENDOR_ID || descriptor.product_id() != PRODUCT_ID {
            continue;
        }
        found_reader = true;

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
        initialized_reader = true;

        let worker_tx = event_tx.clone();
        let worker = tokio::spawn(async move {
            let cards = reader.into_stream();
            futures_util::pin_mut!(cards);
            while let Some(result) = cards.next().await {
                match result {
                    Ok(card) => {
                        if worker_tx.send(ReaderWorkerEvent::Card(card)).is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        warn!(?id, error = ?error, "pasori reader stopped; waiting for reconnect");
                        break;
                    }
                }
            }
            let _ = worker_tx.send(ReaderWorkerEvent::Stopped(id));
        });
        workers.insert(id, worker);
    }

    Ok(ScanResult {
        found_reader,
        initialized_reader,
    })
}

pub fn spawn_readers() -> anyhow::Result<ReaderStream> {
    let context = RusbContext::new()?;

    Ok(stream! {
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();
        let mut workers: HashMap<ReaderId, JoinHandle<()>> = HashMap::new();
        let mut reported_no_readers = false;
        let mut reported_ready = false;
        let mut scan_interval = time::interval(READER_SCAN_INTERVAL);
        scan_interval.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                _ = scan_interval.tick() => {
                    let scan = match scan_readers(&context, &event_tx, &mut workers) {
                        Ok(scan) => scan,
                        Err(error) => {
                            error!(error = %error, "failed to enumerate usb devices");
                            continue;
                        }
                    };

                    if scan.found_reader {
                        reported_no_readers = false;
                    }

                    if scan.initialized_reader && !reported_ready {
                        reported_ready = true;
                        yield Ok(ReaderEvent::Ready);
                    }

                    if !scan.found_reader && workers.is_empty() && !reported_no_readers {
                        warn!("no Pasori reader found; waiting for connection");
                        reported_no_readers = true;
                    }
                }
                event = event_rx.recv() => {
                    match event {
                        Some(ReaderWorkerEvent::Card(card)) => yield Ok(ReaderEvent::Card(card)),
                        Some(ReaderWorkerEvent::Stopped(id)) => {
                            if let Some(worker) = workers.remove(&id)
                                && let Err(error) = worker.await
                            {
                                error!(?id, error = ?error, "pasori reader task failed");
                            }
                            info!(?id, "disconnected pasori reader");
                        }
                        None => break,
                    }
                }
            }
        }
    }
    .boxed())
}
