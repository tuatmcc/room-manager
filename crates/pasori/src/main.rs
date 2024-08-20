#![warn(clippy::all)]
mod device;
mod felica;
mod transport;

use device::rcs380::{Bitrate, Device};
use felica::{BlockCode, PollingRequestCode, PollingTimeSlot, ServiceCode};
use transport::Usb;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

fn main() -> anyhow::Result<()> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;

    let device = Device::new(transport)?;

    let polling_res = device.polling(
        Bitrate::B212F,
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
