use std::{thread, time::Duration};

use anyhow::{anyhow, ensure};
use async_stream::stream;
use futures_util::Stream;
use if_chain::if_chain;
use pasori::{
    device::{Device, rcs380::RCS380},
    felica,
    rusb::{Context as RusbContext, Device as RusbDevice},
    transport::Usb,
};
use room_manager::domain::Card;
use tokio::sync::{
    mpsc::{self, UnboundedReceiver},
    oneshot::{self, error::TryRecvError},
};
use tracing::{error, info};

type DeviceReader = Box<dyn Device + Send + Sync>;

const STUDENT_CARD_SYSTEM_CODE: u16 = 0x809c;
const STUDENT_CARD_SERVICE_CODE: u16 = 0x200b;
const SUICA_SYSTEM_CODE: u16 = 0x0003;
const SUICA_SERVICE_CODE: u16 = 0x090f;

struct InternalPasoriReader {
    device: DeviceReader,
}

impl InternalPasoriReader {
    pub fn new(dev: RusbDevice<RusbContext>) -> anyhow::Result<Self> {
        let transport = Usb::from_device(dev)?;
        let device = RCS380::new(transport)?;

        Ok(Self {
            device: Box::new(device),
        })
    }

    #[allow(clippy::unnecessary_wraps, clippy::too_many_lines)]
    fn scan_card(&mut self) -> anyhow::Result<Option<(felica::Card, Card)>> {
        let Ok(polling_res) = self.device.polling(
            pasori::device::Bitrate::Bitrate212kbs,
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
                info!("Student card system code detected: {:04x}", system_code);

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

                let Some(read_data) = read_res.block_data.first() else {
                    error!("Student card response did not contain any blocks");
                    let card = Card {
                        idm,
                        student_id: None,
                        balance: None,
                    };
                    return Ok(Some((felica_card, card)));
                };
                let student_id = match parse_student_card_block(read_data) {
                    Ok(student_id) => student_id,
                    Err(e) => {
                        error!("Failed to parse student card data: {:?}", e);
                        let card = Card {
                            idm,
                            student_id: None,
                            balance: None,
                        };
                        return Ok(Some((felica_card, card)));
                    }
                };

                info!("Student ID: {}", student_id);
                let card = Card {
                    idm,
                    student_id: Some(student_id),
                    balance: None,
                };
                Ok(Some((felica_card, card)))
            }
            SUICA_SYSTEM_CODE => {
                info!("Suica card system code detected: {:04x}", system_code);

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

                let Some(read_data) = read_res.block_data.first() else {
                    error!("Suica response did not contain any blocks");
                    return Ok(None);
                };
                let balance = match parse_suica_balance_block(read_data) {
                    Ok(balance) => balance,
                    Err(e) => {
                        error!("Failed to parse Suica card data: {:?}", e);
                        return Ok(None);
                    }
                };

                info!("Suica balance: {} yen", balance);
                let card = Card {
                    idm,
                    student_id: None,
                    balance: Some(balance),
                };
                Ok(Some((felica_card, card)))
            }
            _ => {
                info!("Unknown system code detected: {:04x}", system_code);
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
                pasori::device::Bitrate::Bitrate212kbs,
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
    pub fn spawn(dev: RusbDevice<RusbContext>) -> anyhow::Result<Self> {
        let (tx, rx) = mpsc::unbounded_channel();
        let (stop_tx, mut stop_rx) = oneshot::channel();

        let mut reader = InternalPasoriReader::new(dev)?;

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

    async fn next(&mut self) -> anyhow::Result<Option<Card>> {
        if_chain! {
            if let Some(handle) = &self.handle;
            if handle.is_finished();
            if let Some(handle) = self.handle.take();
            then {
                handle.join()
                    .map_err(|payload| anyhow!("PasoriReader thread panicked: {payload:?}"))??;

                return Ok(None);
            }
        }

        if self.handle.is_none() {
            return Ok(None);
        }

        Ok(self.rx.recv().await)
    }

    pub fn into_stream(mut self) -> impl Stream<Item = anyhow::Result<Card>> {
        stream! {
            while let Some(card) = self.next().await? {
                yield Ok(card);
            }
        }
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

fn parse_student_card_block(block: &[u8]) -> anyhow::Result<u32> {
    ensure!(block.len() >= 15, "student card block too short");
    let student_id = std::str::from_utf8(&block[7..15])?;

    Ok(student_id.parse::<u32>()?)
}

fn parse_suica_balance_block(block: &[u8]) -> anyhow::Result<u32> {
    ensure!(block.len() >= 12, "suica block too short");

    Ok(u32::from_le_bytes([block[10], block[11], 0, 0]))
}

#[cfg(test)]
mod tests {
    use super::{parse_student_card_block, parse_suica_balance_block};

    #[test]
    fn parse_student_card_block_parses_student_id() {
        let mut block = [0_u8; 16];
        block[7..15].copy_from_slice(b"12345678");

        let student_id = parse_student_card_block(&block).unwrap();

        assert_eq!(student_id, 12_345_678);
    }

    #[test]
    fn parse_student_card_block_rejects_short_block() {
        let err = parse_student_card_block(&[0; 14]).unwrap_err();

        assert!(err.to_string().contains("too short"));
    }

    #[test]
    fn parse_student_card_block_rejects_invalid_utf8() {
        let mut block = [0_u8; 16];
        block[7..15].copy_from_slice(&[0xff; 8]);

        parse_student_card_block(&block).unwrap_err();
    }

    #[test]
    fn parse_student_card_block_rejects_non_numeric_id() {
        let mut block = [0_u8; 16];
        block[7..15].copy_from_slice(b"abcd1234");

        parse_student_card_block(&block).unwrap_err();
    }

    #[test]
    fn parse_suica_balance_block_parses_balance() {
        let mut block = [0_u8; 16];
        block[10] = 0x39;
        block[11] = 0x05;

        let balance = parse_suica_balance_block(&block).unwrap();

        assert_eq!(balance, 1337);
    }

    #[test]
    fn parse_suica_balance_block_rejects_short_block() {
        let err = parse_suica_balance_block(&[0; 11]).unwrap_err();

        assert!(err.to_string().contains("too short"));
    }
}
