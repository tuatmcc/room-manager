#![warn(clippy::all)]
mod device;
mod transport;

use std::time::Duration;

use device::rcs380::{Bitrate, Chipset, PollingRequest, ProtocolConfig};
use transport::Usb;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID).await?;

    let chipset = Chipset::new(transport).await?;

    let version = chipset.get_firmware_version().await?;
    println!("firmware version: {}", version);

    chipset.switch_rf(false).await?;

    chipset.in_set_rf(Bitrate::B212F).await?;
    chipset
        .in_set_protocol(&ProtocolConfig {
            initial_guard_time: Some(24),
            ..Default::default()
        })
        .await?;
    let polling_res = chipset
        .in_comm_rf(PollingRequest::default(), Duration::from_millis(10))
        .await?;

    println!("{:?}", polling_res);

    Ok(())
}
