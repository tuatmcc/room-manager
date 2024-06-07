#![warn(clippy::all)]
use std::{time::Duration, vec};

use anyhow::{bail, ensure, Context as _};
use nusb::{
    transfer::{Direction, EndpointType, RequestBuffer, TransferError},
    Interface,
};
use tokio::time;

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

const DATASIZE: usize = 300;
const TIMEOUT: Duration = Duration::from_secs(5);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let dev_info = nusb::list_devices()?
        .find(|dev| dev.vendor_id() == VENDER_ID && dev.product_id() == PRODUCT_ID)
        .with_context(|| format!("no device {VENDER_ID}:{PRODUCT_ID}"))?;

    let dev = dev_info.open()?;
    let config = dev
        .configurations()
        .next()
        .context("no usb configuration settings, please replug device")?;

    let interface_group = config.interfaces().next().context("no usb interfaces")?;
    let interface = dev
        .claim_interface(interface_group.interface_number())
        .context("cannot claim interface")?;

    let interface_alt_setting = interface_group
        .alt_settings()
        .next()
        .context("no usb interface settings")?;

    let (Some(addr_in), Some(addr_out)) =
        interface_alt_setting
            .endpoints()
            .fold((None, None), |acc, endpoint| {
                match (
                    endpoint.transfer_type() == EndpointType::Bulk,
                    endpoint.direction(),
                ) {
                    (true, Direction::In) if acc.0.is_none() => (Some(endpoint.address()), acc.1),
                    (true, Direction::Out) if acc.1.is_none() => (acc.0, Some(endpoint.address())),
                    _ => acc,
                }
            })
    else {
        anyhow::bail!("no bulk endpoints for read and write");
    };

    let chipset = Chipset::new(interface, addr_in, addr_out).await?;

    let version = chipset.get_firmware_version().await?;
    println!("firmware version: {}", version);

    Ok(())
}

struct Chipset {
    interface: Interface,
    addr_in: u8,
    addr_out: u8,
}

impl Chipset {
    async fn new(interface: Interface, addr_in: u8, addr_out: u8) -> anyhow::Result<Self> {
        let chipset = Self {
            interface,
            addr_in,
            addr_out,
        };

        chipset.init().await?;

        Ok(chipset)
    }

    async fn init(&self) -> anyhow::Result<()> {
        // ACK送信でソフトリセット
        self.send(Packet::Ack.into_vec(), None).await?;

        // 空読み込みで直前のデータなどをクリア
        let _ = self.recv(Some(Duration::from_millis(10))).await;

        self.set_command_type(1).await?;
        self.switch_rf(false).await?;

        Ok(())
    }

    async fn set_command_type(&self, command_type: u8) -> anyhow::Result<()> {
        let data = self
            .send_packet(Cmd::SetCommandType, &[command_type])
            .await?;

        ensure!(data == [0], "set command type failed");
        Ok(())
    }

    async fn switch_rf(&self, rf: bool) -> anyhow::Result<()> {
        let data = self.send_packet(Cmd::SwitchRF, &[rf as u8]).await?;

        ensure!(data == [0], "switch rf failed");
        Ok(())
    }

    async fn get_firmware_version(&self) -> anyhow::Result<String> {
        let data = self.send_packet(Cmd::GetFirmwareVersion, &[]).await?;

        let version = format!("{:x}.{:02x}", data[1], data[0]);
        Ok(version)
    }

    async fn send(&self, data: Vec<u8>, timeout: Option<Duration>) -> Result<(), TransferError> {
        let timeout = timeout.unwrap_or(TIMEOUT);

        time::timeout(timeout, self.interface.bulk_out(self.addr_out, data))
            .await
            .map_err(|_| TransferError::Cancelled)?
            .into_result()?;

        Ok(())
    }

    async fn recv(&self, timeout: Option<Duration>) -> Result<Vec<u8>, TransferError> {
        let timeout = timeout.unwrap_or(TIMEOUT);
        let buf = RequestBuffer::new(DATASIZE);

        let data = time::timeout(timeout, self.interface.bulk_in(self.addr_in, buf))
            .await
            .map_err(|_| TransferError::Cancelled)?
            .into_result()?;

        Ok(data)
    }

    async fn send_packet(&self, cmd_code: Cmd, cmd_data: &[u8]) -> anyhow::Result<Vec<u8>> {
        let mut data = vec![0; cmd_data.len() + 1];
        data[0] = cmd_code as u8;
        data[1..].copy_from_slice(cmd_data);

        self.send(Packet::Data(&data).into_vec(), None).await?;

        let ack = self.recv(None).await?;
        let ack = Packet::parse(&ack)?;
        ensure!(ack == Packet::Ack, "ack failed");

        let recv = self.recv(None).await?;
        let recv = Packet::parse(&recv)?;

        match recv {
            Packet::Data(data) => {
                if data[0] != cmd_code as u8 + 1 {
                    bail!("invalid response");
                }

                Ok(data[1..].to_vec())
            }
            Packet::Err => bail!("error packet"),
            Packet::Ack => bail!("ack packet"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum Cmd {
    InSetRF = 0x00,
    InSetProtocol = 0x02,
    InCommRF = 0x04,
    SwitchRF = 0x06,
    MaintainFlash = 0x10,
    ResetDevice = 0x12,
    GetFirmwareVersion = 0x20,
    GetPDDataVersion = 0x22,
    GetProperty = 0x24,
    InGetProtocol = 0x26,
    GetCommandType = 0x28,
    SetCommandType = 0x2a,
    InSetRCT = 0x30,
    InGetRCT = 0x32,
    GetPDData = 0x34,
    ReadRegister = 0x36,
    TgSetRF = 0x40,
    TgSetProtocol = 0x42,
    TgSetAuto = 0x44,
    TgSetRFOff = 0x46,
    TgCommRF = 0x48,
    TgGetProtocol = 0x50,
    TgSetRCT = 0x60,
    TgGetRCT = 0x62,
    Diagnose = 0xf0,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Packet<'a> {
    Ack,
    Err,
    Data(&'a [u8]),
}

impl<'a> Packet<'a> {
    const ACK: [u8; 6] = [0x00, 0x00, 0xff, 0x00, 0xff, 0x00];
    const ERR: [u8; 5] = [0x00, 0x00, 0xff, 0xff, 0xff];

    fn into_vec(self) -> Vec<u8> {
        match self {
            Self::Ack => Self::ACK.to_vec(),
            Self::Err => Self::ERR.to_vec(),
            Self::Data(data) => {
                // body = 0xd6 data
                // packet = 0x00 0x00 0xff 0xff 0xff len(L) len(H) checksum(len) body checksum(body) 00

                let mut packet = vec![0; data.len() + 11];

                // header
                packet[0] = 0x00;
                packet[1] = 0x00;
                packet[2] = 0xff;
                packet[3] = 0xff;
                packet[4] = 0xff;

                let len = (data.len() + 1) as u16;
                packet[5] = (len & 0xff) as u8; // len(L)
                packet[6] = (len >> 8) as u8; // len(H)

                let len_checksum = Self::checksum(&packet[5..7]);
                packet[7] = len_checksum; // checksum(len)

                // body
                packet[8] = 0xd6;
                packet[9..9 + data.len()].copy_from_slice(data);

                let body_checksum = Self::checksum(&packet[8..8 + data.len() + 1]);
                packet[9 + data.len()] = body_checksum;

                packet
            }
        }
    }

    fn parse(packet: &'a [u8]) -> anyhow::Result<Self> {
        if packet == Self::ACK {
            return Ok(Self::Ack);
        }

        if packet == Self::ERR {
            return Ok(Self::Err);
        }

        if packet[0..5] != [0x00, 0x00, 0xff, 0xff, 0xff] {
            bail!("invalid packet");
        }

        let len = (packet[5] as u16) | ((packet[6] as u16) << 8);

        let recv_checksum = packet[7];
        let calc_checksum = Self::checksum(&packet[5..7]);
        ensure!(recv_checksum == calc_checksum, "len checksum failed");

        let body = &packet[8..8 + len as usize];
        ensure!(body[0] == 0xd7, "invalid packet");

        let recv_checksum = packet[8 + len as usize];
        let calc_checksum = Self::checksum(body);
        ensure!(recv_checksum == calc_checksum, "body checksum failed");

        let data = &body[1..];

        Ok(Self::Data(data))
    }

    fn checksum(data: &[u8]) -> u8 {
        let sum = data.iter().fold(0i32, |acc, &x| acc + x as i32);

        ((0x100 - sum) % 0x100) as u8
    }
}

#[cfg(test)]
mod test {
    #[test]
    fn checksum() {
        assert_eq!(super::Packet::checksum(&[20, 20]), 216);
        assert_eq!(super::Packet::checksum(&[255, 255]), 2);
        assert_eq!(super::Packet::checksum(&[0, 0]), 0);
    }
}
