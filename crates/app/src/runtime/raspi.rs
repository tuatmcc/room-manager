use anyhow::bail;
use futures_util::StreamExt as _;
use pasori::rusb::{Context as RusbContext, UsbContext};

use crate::{
    infra::{GpioDoorLock, PasoriReader, RodioPlayer},
    runtime::CardStream,
};

const VENDOR_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

pub fn new_sound_player() -> anyhow::Result<RodioPlayer> {
    RodioPlayer::new()
}

pub async fn spawn_door_lock() -> anyhow::Result<GpioDoorLock> {
    GpioDoorLock::spawn().await
}

pub fn spawn_readers() -> anyhow::Result<Vec<CardStream>> {
    let readers = RusbContext::new()?
        .devices()?
        .iter()
        .filter(|dev| {
            let Ok(dev_desc) = dev.device_descriptor() else {
                return false;
            };

            dev_desc.vendor_id() == VENDOR_ID && dev_desc.product_id() == PRODUCT_ID
        })
        .map(|dev| PasoriReader::spawn(dev).map(|reader| reader.into_stream().boxed()))
        .collect::<Result<Vec<_>, _>>()?;

    if readers.is_empty() {
        bail!("No Pasori reader found");
    }

    Ok(readers)
}
