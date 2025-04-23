use std::{thread, time::Duration};

use anyhow::anyhow;
use if_chain::if_chain;
use pasori::{
    device::{Device, rcs380::RCS380},
    transport::Usb,
};
use tokio::sync::{
    mpsc::{self, UnboundedReceiver},
    oneshot::{self, error::TryRecvError},
};
use tracing::info;

use crate::domain::{CardId, CardReader, DomainError};

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

    fn scan_student_card(&mut self) -> anyhow::Result<Option<CardId>> {
        let Ok(polling_res) = self.device.polling(
            pasori::device::Bitrate::Bitrate424kbs,
            Some(STUDENT_CARD_SYSTEM_CODE),
            pasori::felica::PollingRequestCode::SystemCode,
            pasori::felica::PollingTimeSlot::Slot0,
        ) else {
            return Ok(None);
        };

        let card = polling_res.card;
        info!(
            "Student card detected: IDM={:?}",
            idm_to_string(&card.idm())
        );

        let read_res = match self.device.read_without_encryption(
            &card,
            &[pasori::felica::ServiceCode::new(STUDENT_CARD_SERVICE_CODE)],
            &[pasori::felica::BlockCode::new(0, None, 0)],
        ) {
            Ok(res) => res,
            Err(e) => {
                tracing::error!("Failed to read student card data: {:?}", e);
                return Err(DomainError::CardReadError(format!("{e:?}")).into());
            }
        };

        let read_data = &read_res.block_data[0];
        let student_id = std::str::from_utf8(&read_data[7..15])?;
        let student_id = student_id.parse::<u32>()?;

        Ok(Some(CardId::Student {
            id: student_id,
            felica_id: card.idm().to_vec(),
        }))
    }

    fn scan_suica_card(&mut self) -> anyhow::Result<Option<CardId>> {
        let Ok(polling_res) = self.device.polling(
            pasori::device::Bitrate::Bitrate424kbs,
            Some(SUICA_SYSTEM_CODE),
            pasori::felica::PollingRequestCode::SystemCode,
            pasori::felica::PollingTimeSlot::Slot0,
        ) else {
            return Ok(None);
        };

        let card = polling_res.card;
        let idm = idm_to_string(&card.idm());
        info!("Suica card detected: IDm={:?}", idm);

        // 読み取りを行わないとApple Walletが反応してくれないので、残高を空読み取りする
        let read_res = match self.device.read_without_encryption(
            &card,
            &[pasori::felica::ServiceCode::new(SUICA_SERVICE_CODE)],
            &[pasori::felica::BlockCode::new(0, None, 0)],
        ) {
            Ok(res) => res,
            Err(e) => {
                tracing::error!("Failed to read Suica card data: {:?}", e);
                return Err(DomainError::CardReadError(format!("{e:?}")).into());
            }
        };

        let read_data = &read_res.block_data[0];
        let balance = u16::from_le_bytes([read_data[10], read_data[11]]);
        info!("Suica balance: {} yen", balance);

        Ok(Some(CardId::Suica {
            idm,
            felica_id: card.idm().to_vec(),
        }))
    }

    fn get_system_code(card_id: &CardId) -> u16 {
        match card_id {
            CardId::Student { .. } => STUDENT_CARD_SYSTEM_CODE,
            CardId::Suica { .. } => SUICA_SYSTEM_CODE,
        }
    }

    fn get_felica_idm(card_id: &CardId) -> &[u8] {
        match card_id {
            CardId::Student { felica_id, .. } | CardId::Suica { felica_id, .. } => felica_id,
        }
    }

    fn wait_release(&mut self, card_id: &CardId) {
        let system_code = Self::get_system_code(card_id);
        let original_idm = Self::get_felica_idm(card_id);

        loop {
            let Ok(polling_res) = self.device.polling(
                pasori::device::Bitrate::Bitrate424kbs,
                Some(system_code),
                pasori::felica::PollingRequestCode::SystemCode,
                pasori::felica::PollingTimeSlot::Slot0,
            ) else {
                break;
            };

            let new_card = polling_res.card;
            if new_card.idm() != original_idm {
                break;
            }

            thread::sleep(Duration::from_millis(100));
        }

        info!("Card removed: IDM={:?}", idm_to_string(original_idm));
        // スキャン失敗後、すぐにまた反応する可能性があるので、少し待つ
        thread::sleep(Duration::from_millis(500));
    }
}

pub struct PasoriReader {
    rx: UnboundedReceiver<CardId>,
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

                    if let Some(card_id) = reader.scan_student_card()? {
                        if tx.send(card_id.clone()).is_err() {
                            break;
                        }
                        reader.wait_release(&card_id);
                    }
                    if let Some(card_id) = reader.scan_suica_card()? {
                        if tx.send(card_id.clone()).is_err() {
                            break;
                        }
                        reader.wait_release(&card_id);
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
    async fn next(&mut self) -> anyhow::Result<Option<CardId>> {
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
