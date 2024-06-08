#![warn(clippy::all)]
mod device;
mod transport;

use device::rcs380::Chipset;
use transport::Usb;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID).await?;

    let chipset = Chipset::new(transport).await?;

    let version = chipset.get_firmware_version().await?;
    println!("firmware version: {}", version);

    Ok(())
}
