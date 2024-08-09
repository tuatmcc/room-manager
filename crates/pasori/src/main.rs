#![warn(clippy::all)]
mod device;
mod transport;

use device::rcs380::{Bitrate, Device, PollingRequest};
use transport::Usb;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

fn main() -> anyhow::Result<()> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;

    let device = Device::new(transport)?;

    let response = device.sense_ttf(Bitrate::B212F, PollingRequest::default())?;
    println!("{:02x?}", response);

    let response = device.read_without_encryption(&response.idm, 0x200b, 0)?;

    let read_data = &response[14..];
    let student_id = std::str::from_utf8(&read_data[7..15]).unwrap();
    println!("学籍番号: {}", student_id);

    Ok(())
}
