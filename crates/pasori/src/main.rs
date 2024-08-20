use pasori::device::{rcs380::RCS380, Bitrate, Device};
use pasori::felica::{BlockCode, PollingRequestCode, PollingTimeSlot, ServiceCode};
use pasori::transport::Usb;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

fn main() -> anyhow::Result<()> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;

    let device = RCS380::new(transport)?;

    let polling_res = device.polling(
        Bitrate::Bitrate424kbs,
        None,
        PollingRequestCode::SystemCode,
        PollingTimeSlot::Slot0,
    )?;
    let card = polling_res.card;
    println!("{:02x?}", card);

    let read_res = device.read_without_encryption(
        &card,
        &[ServiceCode::new(0x200b)],
        &[BlockCode::new(0, None, 0)],
    )?;

    let read_data = &read_res.block_data[0];
    let student_id = std::str::from_utf8(&read_data[7..15]).unwrap();
    println!("学籍番号: {}", student_id);

    Ok(())
}
