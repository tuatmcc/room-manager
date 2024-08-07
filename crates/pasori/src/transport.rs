use std::time::Duration;

use anyhow::Context as _;
use rusb::{Context, DeviceHandle, Direction, TransferType, UsbContext};

const DEFAULT_TIMEOUT: Duration = Duration::from_millis(1000);
// nfcpyより
const DATA_SIZE: usize = 300;

pub trait Transport {
    fn read(&self, timeout: Option<Duration>) -> anyhow::Result<Vec<u8>>;
    fn write(&self, data: Vec<u8>, timeout: Option<Duration>) -> anyhow::Result<()>;
}

pub struct Usb {
    handle: DeviceHandle<Context>,
    addr_bulk_in: u8,
    addr_bulk_out: u8,
}

impl Usb {
    pub fn from_id(vender_id: u16, product_id: u16) -> anyhow::Result<Self> {
        let context = Context::new()?;

        let (dev, dev_desc) = context
            .devices()?
            .iter()
            .find_map(|dev| {
                let Ok(dev_desc) = dev.device_descriptor() else {
                    return None;
                };

                if dev_desc.vendor_id() == vender_id && dev_desc.product_id() == product_id {
                    Some((dev, dev_desc))
                } else {
                    None
                }
            })
            .context("device not found")?;

        let handle = dev.open()?;

        let config = (0..dev_desc.num_configurations())
            .map(|i| dev.config_descriptor(i))
            .next()
            .context("no usb configuration")??;

        let interface = config.interfaces().next().context("no usb interfaces")?;

        let interface_desc = interface
            .descriptors()
            .next()
            .context("no usb interface settings")?;

        let (Some(addr_bulk_in), Some(addr_bulk_out)) = interface_desc
            .endpoint_descriptors()
            .filter(|endpoint_desc| endpoint_desc.transfer_type() == TransferType::Bulk)
            .fold(
                (None, None),
                |(addr_in, addr_out), endpoint_desc| match endpoint_desc.direction() {
                    Direction::In if addr_in.is_none() => (Some(endpoint_desc.address()), addr_out),
                    Direction::Out if addr_out.is_none() => {
                        (addr_in, Some(endpoint_desc.address()))
                    }
                    _ => (addr_in, addr_out),
                },
            )
        else {
            anyhow::bail!("no bulk endpoints for read and write");
        };

        if handle.kernel_driver_active(interface_desc.interface_number())? {
            handle.detach_kernel_driver(interface_desc.interface_number())?;
        }

        handle.set_active_configuration(config.number())?;
        handle.claim_interface(interface_desc.interface_number())?;
        handle.set_alternate_setting(
            interface_desc.interface_number(),
            interface_desc.setting_number(),
        )?;

        Ok(Self {
            handle,
            addr_bulk_in,
            addr_bulk_out,
        })
    }
}

impl Transport for Usb {
    fn read(&self, timeout: Option<Duration>) -> anyhow::Result<Vec<u8>> {
        let timeout = timeout.unwrap_or(DEFAULT_TIMEOUT);

        let mut buf = vec![0; DATA_SIZE];
        let len = self
            .handle
            .read_bulk(self.addr_bulk_in, &mut buf, timeout)?;

        buf.truncate(len);

        Ok(buf)
    }

    fn write(&self, data: Vec<u8>, timeout: Option<Duration>) -> anyhow::Result<()> {
        let timeout = timeout.unwrap_or(DEFAULT_TIMEOUT);

        self.handle.write_bulk(self.addr_bulk_out, &data, timeout)?;

        Ok(())
    }
}
