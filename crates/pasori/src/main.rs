#![warn(clippy::all)]
mod device;
mod transport;

use std::time::Duration;

use device::rcs380::{Bitrate, Chipset, PollingRequest, ProtocolConfig};
use transport::Usb;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

fn main() -> anyhow::Result<()> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;

    let chipset = Chipset::new(transport)?;

    let version = chipset.get_firmware_version()?;
    println!("firmware version: {}", version);

    chipset.switch_rf(false)?;

    chipset.in_set_rf(Bitrate::B212F)?;
    chipset.in_set_protocol(&ProtocolConfig {
        initial_guard_time: 24,
        ..Default::default()
    })?;
    let polling_res = chipset.in_comm_rf(PollingRequest::default(), Duration::from_millis(10))?;

    println!("{:x?}", polling_res);

    Ok(())
}
