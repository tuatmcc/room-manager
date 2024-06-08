use std::time::Duration;

use anyhow::{bail, ensure};

use crate::transport::Transport;

pub struct Chipset<T> {
    transport: T,
}

impl<T> Chipset<T>
where
    T: Transport,
{
    pub async fn new(transport: T) -> anyhow::Result<Self> {
        let chipset = Self { transport };

        chipset.init().await?;

        Ok(chipset)
    }

    async fn init(&self) -> anyhow::Result<()> {
        // ACK送信でソフトリセット
        self.transport.write(Packet::Ack.into_vec(), None).await?;

        // 空読み込みで直前のデータなどをクリア
        let _ = self.transport.read(Some(Duration::from_millis(10))).await;

        self.set_command_type(1).await?;
        self.switch_rf(false).await?;

        Ok(())
    }

    pub async fn set_command_type(&self, command_type: u8) -> anyhow::Result<()> {
        let data = self
            .send_packet(CmdCode::SetCommandType, &[command_type])
            .await?;

        ensure!(data == [0], "set command type failed");
        Ok(())
    }

    pub async fn switch_rf(&self, rf: bool) -> anyhow::Result<()> {
        let data = self.send_packet(CmdCode::SwitchRF, &[rf as u8]).await?;

        ensure!(data == [0], "switch rf failed");
        Ok(())
    }

    pub async fn get_firmware_version(&self) -> anyhow::Result<String> {
        let data = self.send_packet(CmdCode::GetFirmwareVersion, &[]).await?;

        let version = format!("{:x}.{:02x}", data[1], data[0]);
        Ok(version)
    }

    async fn send_packet(&self, cmd_code: CmdCode, cmd_data: &[u8]) -> anyhow::Result<Vec<u8>> {
        self.transport
            .write(Packet::data(cmd_code as u8, cmd_data).into_vec(), None)
            .await?;

        let ack = self.transport.read(None).await?;
        let ack = Packet::parse(&ack)?;
        ensure!(ack == Packet::Ack, "ack failed");

        let recv = self.transport.read(None).await?;
        let recv = Packet::parse(&recv)?;

        match recv {
            Packet::Data {
                cmd_code: recv_code,
                cmd_data,
            } => {
                if recv_code != cmd_code as u8 + 1 {
                    bail!("invalid response");
                }

                Ok(cmd_data.to_vec())
            }
            Packet::Err => bail!("error packet"),
            Packet::Ack => bail!("ack packet"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum CmdCode {
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
    Data { cmd_code: u8, cmd_data: &'a [u8] },
}

impl<'a> Packet<'a> {
    const ACK: [u8; 6] = [0x00, 0x00, 0xff, 0x00, 0xff, 0x00];
    const ERR: [u8; 5] = [0x00, 0x00, 0xff, 0xff, 0xff];

    fn data(code: u8, data: &'a [u8]) -> Self {
        Self::Data {
            cmd_code: code,
            cmd_data: data,
        }
    }

    fn into_vec(self) -> Vec<u8> {
        match self {
            Self::Ack => Self::ACK.to_vec(),
            Self::Err => Self::ERR.to_vec(),
            Self::Data { cmd_code, cmd_data } => {
                // data = cmd_code cmd_data
                // body = 0xd6 data
                // packet = 0x00 0x00 0xff 0xff 0xff len(L) len(H) checksum(len) body checksum(body) 00

                let mut packet = vec![0; cmd_data.len() + 12];

                // header
                packet[0] = 0x00;
                packet[1] = 0x00;
                packet[2] = 0xff;
                packet[3] = 0xff;
                packet[4] = 0xff;

                let len = (cmd_data.len() + 2) as u16;
                packet[5] = (len & 0xff) as u8; // len(L)
                packet[6] = (len >> 8) as u8; // len(H)

                let len_checksum = Self::checksum(&packet[5..7]);
                packet[7] = len_checksum; // checksum(len)

                // body
                packet[8] = 0xd6;
                packet[9] = cmd_code;
                packet[10..10 + cmd_data.len()].copy_from_slice(cmd_data);

                let body_checksum = Self::checksum(&packet[8..8 + cmd_data.len() + 2]);
                packet[10 + cmd_data.len()] = body_checksum;

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

        let cmd_code = body[1];
        let cmd_data = &body[2..];

        Ok(Self::Data { cmd_code, cmd_data })
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
