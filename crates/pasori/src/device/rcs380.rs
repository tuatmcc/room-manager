#![allow(dead_code)]
use std::{borrow::Cow, time::Duration};

use anyhow::{bail, ensure};

use crate::transport::Transport;

pub struct Chipset<T: Transport> {
    transport: T,
}

impl<T: Transport> Chipset<T> {
    pub fn new(transport: T) -> anyhow::Result<Self> {
        let chipset = Self { transport };

        chipset.init()?;

        Ok(chipset)
    }

    pub fn in_set_rf(
        &self,
        send_bitrate: Bitrate,
        recv_bitrate: Option<Bitrate>,
    ) -> anyhow::Result<()> {
        let mut cmd_data = [0; 4];
        cmd_data[0..2].copy_from_slice(&send_bitrate.to_in_set_rf_settings());
        cmd_data[2..4]
            .copy_from_slice(&recv_bitrate.unwrap_or(send_bitrate).to_in_set_rf_settings());

        let data = self.send_packet(CmdCode::InSetRF, &cmd_data)?;

        ensure!(data == [0], "set rf failed");
        Ok(())
    }

    pub fn in_set_protocol(&self, config: &InProtocolConfig) -> anyhow::Result<()> {
        let cmd_data = config.serialize();

        let data = self.send_packet(CmdCode::InSetProtocol, &cmd_data)?;

        ensure!(data == [0], "set protocol failed");
        Ok(())
    }

    pub fn in_comm_rf(
        &self,
        request: PollingRequest,
        timeout: Duration,
    ) -> anyhow::Result<PollingResponse> {
        let timeout = if timeout.as_millis() == 0 {
            0
        } else {
            (((timeout.as_millis() + 1) * 10) as u16).min(0xffff)
        };

        let request = request.serialize();
        let mut cmd_data = vec![0; 3 + request.len()];
        cmd_data[0] = (timeout & 0xff) as u8;
        cmd_data[1] = (timeout >> 8) as u8;
        cmd_data[2] = request.len() as u8 + 1;
        cmd_data[3..].copy_from_slice(&request);

        let data = self.send_packet(CmdCode::InCommRF, &cmd_data)?;
        ensure!(data[0..4] == [0, 0, 0, 0], "comm rf failed");

        let idm = data[7..15].try_into().unwrap();
        let pmm = data[15..23].try_into().unwrap();

        let request_result = if data.len() == 25 {
            Some(data[23..25].try_into().unwrap())
        } else {
            None
        };

        Ok(PollingResponse {
            idm,
            pmm,
            request_result,
        })
    }

    pub fn switch_rf(&self, rf: bool) -> anyhow::Result<()> {
        let data = self.send_packet(CmdCode::SwitchRF, &[rf as u8])?;

        ensure!(data == [0], "switch rf failed");
        Ok(())
    }

    pub fn tg_set_rf(&self, bitrate: Bitrate) -> anyhow::Result<()> {
        let cmd_data = bitrate.to_tg_set_rf_settings();

        let data = self.send_packet(CmdCode::TgSetRF, &cmd_data)?;

        ensure!(data == [0], "set rf failed");
        Ok(())
    }

    pub fn tg_set_protocol(&self, config: &TgProtocolConfig) -> anyhow::Result<()> {
        let cmd_data = config.serialize();

        let data = self.send_packet(CmdCode::TgSetProtocol, &cmd_data)?;

        ensure!(data == [0], "set protocol failed");
        Ok(())
    }

    pub fn get_firmware_version(&self) -> anyhow::Result<String> {
        let data = self.send_packet(CmdCode::GetFirmwareVersion, &[])?;

        let version = format!("{:x}.{:02x}", data[1], data[0]);
        Ok(version)
    }

    pub fn set_command_type(&self, command_type: u8) -> anyhow::Result<()> {
        let data = self.send_packet(CmdCode::SetCommandType, &[command_type])?;

        ensure!(data == [0], "set command type failed");
        Ok(())
    }

    fn init(&self) -> anyhow::Result<()> {
        // ACK送信でソフトリセット
        self.transport
            .write(Packet::Ack.serialize().as_ref(), None)?;

        // 空読み込みで直前のデータなどをクリア
        let _ = self.transport.read(Some(Duration::from_millis(10)));

        self.set_command_type(1)?;
        self.switch_rf(false)?;

        Ok(())
    }

    fn close(&self) -> anyhow::Result<()> {
        self.switch_rf(false)?;
        self.transport
            .write(Packet::Ack.serialize().as_ref(), None)?;

        Ok(())
    }

    fn send_packet(&self, cmd_code: CmdCode, cmd_data: &[u8]) -> anyhow::Result<Vec<u8>> {
        self.transport.write(
            Packet::data(cmd_code as u8, cmd_data).serialize().as_ref(),
            None,
        )?;

        let ack = self.transport.read(None)?;
        let ack = Packet::parse(&ack)?;
        ensure!(ack == Packet::Ack, "ack failed");

        let recv = self.transport.read(None)?;
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

impl<T: Transport> Drop for Chipset<T> {
    fn drop(&mut self) {
        self.close().expect("close failed");
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PollingResponse {
    idm: [u8; 8],
    pmm: [u8; 8],
    request_result: Option<[u8; 2]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PollingRequest {
    pub system_code: Option<u16>,
    pub request_code: PollingRequestCode,
    pub time_slot: PollingTimeSlot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PollingRequestCode {
    None = 0x00,
    #[default]
    SystemCode = 0x01,
    TransmissionCapability = 0x02,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PollingTimeSlot {
    #[default]
    Slot0 = 0x00,
    Slot1 = 0x01,
    Slot3 = 0x03,
    Slot7 = 0x07,
    Slot15 = 0x0f,
}

impl PollingRequest {
    fn serialize(&self) -> [u8; 5] {
        // data = 0x00 system_code(L) system_code(H) request_code time_slot
        let mut data = [0; 5];

        let system_code = self.system_code.unwrap_or(0xffff);
        data[1] = (system_code & 0xff) as u8;
        data[2] = (system_code >> 8) as u8;

        data[3] = self.request_code as u8;
        data[4] = self.time_slot as u8;

        data
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bitrate {
    B212F,
    B424F,
    B106A,
    B212A,
    B424A,
    B106B,
    B212B,
    B424B,
}

impl Bitrate {
    fn to_in_set_rf_settings(self) -> [u8; 4] {
        match self {
            Bitrate::B212F => [0x01, 0x01, 0x0f, 0x01],
            Bitrate::B424F => [0x01, 0x02, 0x0f, 0x02],
            Bitrate::B106A => [0x02, 0x03, 0x0f, 0x03],
            Bitrate::B212A => [0x04, 0x04, 0x0f, 0x04],
            Bitrate::B424A => [0x05, 0x05, 0x0f, 0x05],
            Bitrate::B106B => [0x03, 0x07, 0x0f, 0x07],
            Bitrate::B212B => [0x03, 0x08, 0x0f, 0x08],
            Bitrate::B424B => [0x03, 0x09, 0x0f, 0x09],
        }
    }
    fn to_tg_set_rf_settings(self) -> [u8; 2] {
        match self {
            Bitrate::B106A => [0x08, 0x0b],
            Bitrate::B212F => [0x08, 0x0c],
            Bitrate::B424F => [0x08, 0x0d],
            Bitrate::B212A => [0x08, 0x0e],
            Bitrate::B424A => [0x08, 0x0f],
            _ => unreachable!(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InProtocolConfig {
    pub initial_guard_time: u8,
    pub add_crc: u8,
    pub check_crc: u8,
    pub multi_card: u8,
    pub add_parity: u8,
    pub check_parity: u8,
    pub bitwise_anticoll: u8,
    pub last_byte_bit_count: u8,
    pub mifare_crypto: u8,
    pub add_sof: u8,
    pub check_sof: u8,
    pub add_eof: u8,
    pub check_eof: u8,
    pub deaf_time: u8,
    pub continuous_receive_mode: u8,
    pub min_len_for_crm: u8,
    pub type_1_tag_rrdd: u8,
    pub rfca: u8,
    pub guard_time: u8,
}

impl Default for InProtocolConfig {
    fn default() -> Self {
        Self {
            initial_guard_time: 0x18,
            add_crc: 0x01,
            check_crc: 0x01,
            multi_card: 0x00,
            add_parity: 0x00,
            check_parity: 0x00,
            bitwise_anticoll: 0x00,
            last_byte_bit_count: 0x08,
            mifare_crypto: 0x00,
            add_sof: 0x00,
            check_sof: 0x00,
            add_eof: 0x00,
            check_eof: 0x00,
            deaf_time: 0x00,
            continuous_receive_mode: 0x00,
            min_len_for_crm: 0x00,
            type_1_tag_rrdd: 0x00,
            rfca: 0x00,
            guard_time: 0x06,
        }
    }
}

impl InProtocolConfig {
    fn serialize(self) -> [u8; 38] {
        #[rustfmt::skip]
        let data = [
            0x00, self.initial_guard_time,
            0x01, self.add_crc,
            0x02, self.check_crc,
            0x03, self.multi_card,
            0x04, self.add_parity,
            0x05, self.check_parity,
            0x06, self.bitwise_anticoll,
            0x07, self.last_byte_bit_count,
            0x08, self.mifare_crypto,
            0x09, self.add_sof,
            0x0a, self.check_sof,
            0x0b, self.add_eof,
            0x0c, self.check_eof,
            0x0e, self.deaf_time,
            0x0f, self.continuous_receive_mode,
            0x10, self.min_len_for_crm,
            0x11, self.type_1_tag_rrdd,
            0x12, self.rfca,
            0x13, self.guard_time,
        ];

        data
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TgProtocolConfig {
    send_timeout_time_unit: u8,
    rf_off_error: u8,
    continuous_receive_mode: u8,
}

impl Default for TgProtocolConfig {
    fn default() -> Self {
        Self {
            send_timeout_time_unit: 0x01,
            rf_off_error: 0x01,
            continuous_receive_mode: 0x07,
        }
    }
}

impl TgProtocolConfig {
    fn serialize(self) -> [u8; 6] {
        #[rustfmt::skip]
        let data = [
            0x00, self.send_timeout_time_unit,
            0x01, self.rf_off_error,
            0x02, self.continuous_receive_mode,
        ];

        data
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

    fn serialize(self) -> Cow<'static, [u8]> {
        match self {
            Self::Ack => Cow::Borrowed(&Self::ACK),
            Self::Err => Cow::Borrowed(&Self::ERR),
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

                Cow::Owned(packet)
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
