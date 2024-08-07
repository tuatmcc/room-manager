use std::io;
use std::time::Duration;

use anyhow::Context;
use nusb::transfer::{Direction, EndpointType, RequestBuffer};
use nusb::Interface;
use tokio::time;

const DEFAULT_TIMEOUT: Duration = Duration::from_millis(1000);
// nfcpyより
const DATASIZE: usize = 300;

pub trait Transport {
    async fn read(&self, timeout: Option<Duration>) -> Result<Vec<u8>, io::Error>;
    async fn write(&self, data: Vec<u8>, timeout: Option<Duration>) -> Result<(), io::Error>;
}

pub struct Usb {
    interface: Interface,
    addr_bulk_in: u8,
    addr_bulk_out: u8,
}

impl Usb {
    pub async fn from_id(vender_id: u16, product_id: u16) -> anyhow::Result<Self> {
        let dev_info = nusb::list_devices()?
            .find(|dev_info| {
                dev_info.vendor_id() == vender_id && dev_info.product_id() == product_id
            })
            .with_context(|| format!("no device {:#06x}:{:#06x}", vender_id, product_id))?;

        let dev = dev_info.open()?;

        let config = dev
            .configurations()
            .next()
            .context("no usb configuration")?;

        let interface_group = config.interfaces().next().context("no usb interfaces")?;

        let interface = dev.claim_interface(interface_group.interface_number())?;

        let interface_alt_setting = interface_group
            .alt_settings()
            .next()
            .context("no usb interface settings")?;

        let (Some(addr_bulk_in), Some(addr_bulk_out)) = interface_alt_setting
            .endpoints()
            .filter(|endpoint| endpoint.transfer_type() == EndpointType::Bulk)
            .fold(
                (None, None),
                |(addr_in, addr_out), endpoint| match endpoint.direction() {
                    Direction::In if addr_in.is_none() => (Some(endpoint.address()), addr_out),
                    Direction::Out if addr_out.is_none() => (addr_in, Some(endpoint.address())),
                    _ => (addr_in, addr_out),
                },
            )
        else {
            anyhow::bail!("no bulk endpoints for read and write");
        };

        Ok(Self {
            interface,
            addr_bulk_in,
            addr_bulk_out,
        })
    }
}

impl Transport for Usb {
    async fn read(&self, timeout: Option<Duration>) -> Result<Vec<u8>, io::Error> {
        let timeout = timeout.unwrap_or(DEFAULT_TIMEOUT);

        let buf = RequestBuffer::new(DATASIZE);
        let data = time::timeout(timeout, self.interface.bulk_in(self.addr_bulk_in, buf))
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "read timeout"))?
            .into_result()?;

        Ok(data)
    }

    async fn write(&self, data: Vec<u8>, timeout: Option<Duration>) -> Result<(), io::Error> {
        let timeout = timeout.unwrap_or(DEFAULT_TIMEOUT);

        time::timeout(timeout, self.interface.bulk_out(self.addr_bulk_out, data))
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "write timeout"))?
            .into_result()?;

        Ok(())
    }
}
