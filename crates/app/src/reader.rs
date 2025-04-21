use pasori::{
    device::{Device, rcs380::RCS380},
    felica::Card,
    transport::Usb,
};
use tokio::time;
use tracing::info;

use crate::CardKind;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

const STUDENT_CARD_SYSTEM_CODE: u16 = 0x809c; // 学生証のシステムコード
const STUDENT_CARD_SERVICE_CODE: u16 = 0x200b; // 学籍番号が格納されているサービスコード
const SUICA_SYSTEM_CODE: u16 = 0x0003; // Suicaのシステムコード
const SUICA_SERVICE_CODE: u16 = 0x090f; // 残高が格納されているサービスコード

type Reader = Box<dyn Device + Send + Sync>;

pub struct DetectedCard {
    pub card: Card,
    pub kind: CardKind,
}

pub fn open_reader() -> anyhow::Result<Reader> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;
    let device = RCS380::new(transport)?;
    Ok(Box::new(device))
}

pub fn scan_card(reader: &mut Reader) -> anyhow::Result<Option<DetectedCard>> {
    if let Some((card, student_id)) = scan_student_card(reader)? {
        return Ok(Some(DetectedCard {
            card,
            kind: CardKind::Student(student_id),
        }));
    }

    if let Some((card, idm)) = scan_suica_card(reader)? {
        return Ok(Some(DetectedCard {
            card,
            kind: CardKind::Suica(idm),
        }));
    }

    Ok(None)
}

fn scan_student_card(reader: &mut Reader) -> anyhow::Result<Option<(Card, u32)>> {
    let Ok(polling_res) = reader.polling(
        pasori::device::Bitrate::Bitrate424kbs,
        Some(STUDENT_CARD_SYSTEM_CODE),
        pasori::felica::PollingRequestCode::SystemCode,
        pasori::felica::PollingTimeSlot::Slot0,
    ) else {
        return Ok(None);
    };

    let card = polling_res.card;
    info!("Card detected: {:?}", idm_to_string(&card.idm()));

    let read_res = match reader.read_without_encryption(
        &card,
        &[pasori::felica::ServiceCode::new(STUDENT_CARD_SERVICE_CODE)],
        &[pasori::felica::BlockCode::new(0, None, 0)],
    ) {
        Ok(res) => res,
        Err(e) => {
            tracing::error!("Failed to read card: {:?}", e);
            return Ok(None);
        }
    };

    let read_data = &read_res.block_data[0];
    let student_id = std::str::from_utf8(&read_data[7..15])?;
    let student_id = student_id.parse::<u32>()?;

    Ok(Some((card, student_id)))
}

fn scan_suica_card(reader: &mut Reader) -> anyhow::Result<Option<(Card, String)>> {
    let Ok(polling_res) = reader.polling(
        pasori::device::Bitrate::Bitrate424kbs,
        Some(SUICA_SYSTEM_CODE),
        pasori::felica::PollingRequestCode::SystemCode,
        pasori::felica::PollingTimeSlot::Slot0,
    ) else {
        return Ok(None);
    };

    let card = polling_res.card;
    let idm = idm_to_string(&card.idm());
    info!("Card detected: {:?}", idm);

    // 読み取りを行わないとApple Walletが反応してくれないので、残高を空読み取りする
    let read_res = match reader.read_without_encryption(
        &card,
        &[pasori::felica::ServiceCode::new(SUICA_SERVICE_CODE)],
        &[pasori::felica::BlockCode::new(0, None, 0)],
    ) {
        Ok(res) => res,
        Err(e) => {
            tracing::error!("Failed to read card: {:?}", e);
            return Ok(None);
        }
    };

    let read_data = &read_res.block_data[0];
    let balance = u16::from_le_bytes([read_data[10], read_data[11]]);
    info!("Read data: {}", balance);

    Ok(Some((card, idm)))
}

pub async fn wait_for_release(reader: &mut Reader, card: &Card, kind: &CardKind) {
    loop {
        let Ok(polling_res) = reader.polling(
            pasori::device::Bitrate::Bitrate424kbs,
            Some(match kind {
                CardKind::Student(_) => STUDENT_CARD_SYSTEM_CODE,
                CardKind::Suica(_) => SUICA_SYSTEM_CODE,
            }),
            pasori::felica::PollingRequestCode::SystemCode,
            pasori::felica::PollingTimeSlot::Slot0,
        ) else {
            break;
        };

        let new_card = polling_res.card;
        if new_card.idm() != card.idm() {
            break;
        }

        time::sleep(time::Duration::from_secs_f32(0.1)).await;
    }

    info!("Card released: {:?}", idm_to_string(&card.idm()));
    // スキャン失敗後、すぐにまた反応する可能性があるので、少し待つ
    time::sleep(time::Duration::from_secs_f32(0.5)).await;
}

fn idm_to_string(idm: &[u8]) -> String {
    idm.iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<Vec<_>>()
        .join("")
}
