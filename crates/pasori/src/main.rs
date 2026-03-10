use pasori::device::{Bitrate, Device, rcs380::RCS380};
use pasori::felica::{BlockCode, PollingRequestCode, PollingTimeSlot, ServiceCode};
use pasori::transport::Usb;
use tracing::info;

const VENDOR_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .init();
    info!("starting pasori example");

    let transport = Usb::from_id(VENDOR_ID, PRODUCT_ID)?;
    info!("opened usb transport");

    let device = RCS380::new(transport)?;
    info!("initialized rcs380 device");

    let polling_res = device.polling(
        Bitrate::Bitrate424kbs,
        None,
        PollingRequestCode::SystemCode,
        PollingTimeSlot::Slot0,
    )?;
    let card = polling_res.card;
    info!(card = ?card, "polled card");

    let read_res = device.read_without_encryption(
        &card,
        &[ServiceCode::new(0x200b)],
        &[BlockCode::new(0, None, 0)],
    )?;

    let read_data = &read_res.block_data[0];
    let student_id = std::str::from_utf8(&read_data[7..15]).unwrap();
    info!(student_id, "read student id");

    Ok(())
}
