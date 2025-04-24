use std::{thread, time::Duration};

use anyhow::anyhow;
use if_chain::if_chain;
use pasori::{
    device::{Device, rcs380::RCS380},
    felica,
    transport::Usb,
};
use tokio::sync::{
    mpsc::{self, UnboundedReceiver},
    oneshot::{self, error::TryRecvError},
};
use tracing::{error, info};

use crate::domain::{Card, CardReader};

type DeviceReader = Box<dyn Device + Send + Sync>;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

const STUDENT_CARD_SYSTEM_CODE: u16 = 0x809c;
const STUDENT_CARD_SERVICE_CODE: u16 = 0x200b;
const SUICA_SYSTEM_CODE: u16 = 0x0003;
const SUICA_SERVICE_CODE: u16 = 0x090f;

struct InternalPasoriReader {
    device: DeviceReader,
}

impl InternalPasoriReader {
    pub fn new() -> anyhow::Result<Self> {
        let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;
        let device = RCS380::new(transport)?;

        Ok(Self {
            device: Box::new(device),
        })
    }

    #[allow(clippy::unnecessary_wraps)]
    fn scan_card(&mut self) -> anyhow::Result<Option<(felica::Card, Card)>> {
        let Ok(polling_res) = self.device.polling(
            pasori::device::Bitrate::Bitrate424kbs,
            None,
            pasori::felica::PollingRequestCode::SystemCode,
            pasori::felica::PollingTimeSlot::Slot0,
        ) else {
            return Ok(None);
        };

        let felica_card = polling_res.card;
        let idm = idm_to_string(&felica_card.idm());
        info!("felica card detected: IDm={:?}", idm);

        let Some(system_code) = felica_card.system_code() else {
            info!("No system code found");
            let card = Card {
                idm,
                student_id: None,
                balance: None,
            };
            return Ok(Some((felica_card, card)));
        };

        match system_code {
            STUDENT_CARD_SYSTEM_CODE => {
                info!("Student card system code detected: {}", system_code);

                let read_res = match self.device.read_without_encryption(
                    &felica_card,
                    &[pasori::felica::ServiceCode::new(STUDENT_CARD_SERVICE_CODE)],
                    &[pasori::felica::BlockCode::new(0, None, 0)],
                ) {
                    Ok(res) => res,
                    Err(e) => {
                        error!("Failed to read student card data: {:?}", e);
                        let card = Card {
                            idm,
                            student_id: None,
                            balance: None,
                        };
                        return Ok(Some((felica_card, card)));
                    }
                };

                let read_data = &read_res.block_data[0];
                let student_id = std::str::from_utf8(&read_data[7..15])?;
                let student_id = student_id.parse::<u32>()?;

                info!("Student ID: {}", student_id);
                let card = Card {
                    idm,
                    student_id: Some(student_id),
                    balance: None,
                };
                Ok(Some((felica_card, card)))
            }
            SUICA_SYSTEM_CODE => {
                info!("Suica card system code detected: {}", system_code);

                let read_res = match self.device.read_without_encryption(
                    &felica_card,
                    &[pasori::felica::ServiceCode::new(SUICA_SERVICE_CODE)],
                    &[pasori::felica::BlockCode::new(0, None, 0)],
                ) {
                    Ok(res) => res,
                    Err(e) => {
                        tracing::error!("Failed to read Suica card data: {:?}", e);
                        return Ok(None);
                    }
                };

                let read_data = &read_res.block_data[0];
                let balance = u32::from_le_bytes([read_data[10], read_data[11], 0, 0]);

                info!("Suica balance: {} yen", balance);
                let card = Card {
                    idm,
                    student_id: None,
                    balance: Some(balance),
                };
                Ok(Some((felica_card, card)))
            }
            _ => {
                info!("Unknown system code detected: {}", system_code);
                let card = Card {
                    idm,
                    student_id: None,
                    balance: None,
                };
                Ok(Some((felica_card, card)))
            }
        }
    }

    fn wait_release(&mut self, felica_card: &felica::Card) {
        loop {
            let Ok(polling_res) = self.device.polling(
                pasori::device::Bitrate::Bitrate424kbs,
                felica_card.system_code(),
                pasori::felica::PollingRequestCode::SystemCode,
                pasori::felica::PollingTimeSlot::Slot0,
            ) else {
                break;
            };

            let new_felica_card = polling_res.card;
            if new_felica_card.idm() != felica_card.idm() {
                break;
            }

            thread::sleep(Duration::from_millis(100));
        }

        info!("Card released: IDm={:?}", idm_to_string(&felica_card.idm()));
        // スキャン失敗後、すぐにまた反応する可能性があるので、少し待つ
        thread::sleep(Duration::from_millis(500));
    }
}

pub struct PasoriReader {
    rx: UnboundedReceiver<Card>,
    stop_tx: Option<oneshot::Sender<()>>,
    handle: Option<thread::JoinHandle<anyhow::Result<()>>>,
}

impl PasoriReader {
    pub fn spawn() -> anyhow::Result<Self> {
        let (tx, rx) = mpsc::unbounded_channel();
        let (stop_tx, mut stop_rx) = oneshot::channel();
        let mut reader = InternalPasoriReader::new()?;

        let handle = thread::Builder::new()
            .name("pasori_reader".to_string())
            .spawn(move || -> anyhow::Result<()> {
                info!("PasoriReader thread started successfully");
                loop {
                    match stop_rx.try_recv() {
                        Ok(()) | Err(TryRecvError::Closed) => {
                            break;
                        }
                        Err(TryRecvError::Empty) => {}
                    }

                    if let Some((felica_card, card)) = reader.scan_card()? {
                        if tx.send(card).is_err() {
                            break;
                        }
                        reader.wait_release(&felica_card);
                    }

                    thread::sleep(Duration::from_millis(100));
                }

                info!("PasoriReader thread stopped successfully");
                Ok(())
            })?;

        Ok(Self {
            rx,
            stop_tx: Some(stop_tx),
            handle: Some(handle),
        })
    }
}

impl CardReader for PasoriReader {
    async fn next(&mut self) -> anyhow::Result<Option<Card>> {
        if_chain! {
            if let Some(handle) = &self.handle;
            if handle.is_finished();
            if let Some(handle) = self.handle.take();
            then {
                handle.join()
                    .map_err(|payload| anyhow!("PasoriReader thread panicked: {:?}", payload))??;

                return Ok(None);
            }
        }

        if self.handle.is_none() {
            return Ok(None);
        }

        Ok(self.rx.recv().await)
    }
}

impl Drop for PasoriReader {
    fn drop(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn idm_to_string(idm: &[u8]) -> String {
    let mut result = String::with_capacity(idm.len() * 2);
    for &byte in idm {
        use std::fmt::Write;
        write!(result, "{byte:02x}").unwrap();
    }
    result
}
