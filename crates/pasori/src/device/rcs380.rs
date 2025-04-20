#![allow(dead_code)]
use std::{borrow::Cow, time::Duration};

use anyhow::{bail, ensure};
use if_chain::if_chain;

use crate::{
    felica::{
        BlockCode, Card, PollingRequestCode, PollingResponse, PollingTimeSlot,
        ReadWithoutEncryptionResponse, ServiceCode,
    },
    transport::Transport,
};

use super::{Bitrate, Device};

pub struct RCS380<T: Transport> {
    chipset: Chipset<T>,
}

impl<T: Transport> RCS380<T> {
    pub fn new(transport: T) -> anyhow::Result<Self> {
        let chipset = Chipset::new(transport)?;

        Ok(Self { chipset })
    }

    pub fn mute(&self) -> anyhow::Result<()> {
        self.chipset.switch_rf(false)
    }
}

impl<T: Transport> Device for RCS380<T> {
    fn polling(
        &self,
        bitrate: Bitrate,
        system_code: Option<u16>,
        request_code: PollingRequestCode,
        time_slot: PollingTimeSlot,
    ) -> anyhow::Result<PollingResponse> {
        // req = 0x00 SystemCode(H) SystemCode(L) RequestCode TimeSlot
        // res = len 0x01 IDm(8) PMm(8) [Request Data(2)]

        self.chipset.in_set_rf(bitrate, None)?;
        self.chipset.in_set_protocol(&InitiatorConfig {
            initial_guard_time: Some(0x18),
            ..Default::default()
        })?;

        let mut req = Vec::new();

        req.push(0x00);
        let system_code = system_code.unwrap_or(0xffff);
        req.push((system_code >> 8) as u8);
        req.push(system_code as u8);

        req.push(request_code as u8);
        req.push(time_slot as u8);

        let res = self.chipset.in_comm_rf(&req, Duration::from_millis(10))?;

        ensure!(res[0] == res.len() as u8, "invalid response");
        ensure!(res[1] == 0x01, "invalid response");

        let idm = res[2..10].try_into().unwrap();
        let pmm = res[10..18].try_into().unwrap();

        let request_result = if res.len() == 0x14 {
            Some(((res[18] as u16) << 8) | res[19] as u16)
        } else {
            None
        };

        let system_code = if_chain! {
            if let Some(system_code) = request_result;
            if request_code == PollingRequestCode::SystemCode;
            then { Some(system_code) }
            else { None }
        };

        let card = Card::new(idm, pmm, system_code);

        Ok(PollingResponse {
            card,
            request_result,
        })
    }

    fn read_without_encryption(
        &self,
        card: &Card,
        service_codes: &[ServiceCode],
        block_codes: &[BlockCode],
    ) -> anyhow::Result<ReadWithoutEncryptionResponse> {
        // req = 0x06 IDm(8) len(ServiceCode) ServiceCode... len(BlockCode) BlockCode...
        // res = len 0x07 IDm(8) StatusFlag1 StatusFlag2 len(BlockData) BlockData...

        let mut req = Vec::new();

        req.push(0x06);

        // IDm
        req.extend_from_slice(&card.idm());

        // サービス数
        req.push(service_codes.len() as u8);
        // サービスコード (リトルエンディアン)
        for service_code in service_codes {
            req.extend_from_slice(&service_code.to_bytes());
        }

        // ブロック数
        req.push(service_codes.len() as u8);
        // ブロックコード
        for block_code in block_codes {
            req.extend_from_slice(&block_code.to_bytes());
        }

        // pmm = ICCode(2) D10 D11 D12 D13 D14 D15
        //                             ^^^ Read Without Encryptionのタイムアウトパラメータ
        let param = card.pmm()[4];
        let a = (param & 0b0000_0111) as f64;
        let b = ((param & 0b0011_1000) >> 3) as f64;
        let e = ((param & 0b1100_0000) >> 6) as i32;

        let n = block_codes.len() as f64;

        let t = 256.0 * 16.0 / 13.56 * 1_000_000.0;

        let timeout = t * ((b + 1.0) * n + (a + 1.0)) * 4.0_f64.powi(e);
        let timeout = Duration::from_secs_f64(timeout / 1_000.0);

        let res = self.chipset.in_comm_rf(&req, timeout)?;

        ensure!(res[0] == res.len() as u8, "invalid response");
        ensure!(res[1] == 0x07, "invalid response");
        ensure!(res[2..10] == card.idm(), "invalid response");

        let status_flag1 = res[10];
        let status_flag2 = res[11];

        if status_flag1 != 0x00 || status_flag2 != 0x00 {
            // TODO: https://www.sony.co.jp/Products/felica/business/tech-support/data/card_usersmanual_2.21j.pdf の4.5を参考にエラーを返す
            bail!(
                "read without encryption failed: status_flag1 = {:#x}, status_flag2 = {:#x}",
                status_flag1,
                status_flag2
            );
        }

        let block_data_len = res[12] as usize;

        let mut block_data = Vec::new();
        for i in 0..block_data_len {
            block_data.push(res[(13 + i)..(13 + i + 16)].to_vec());
        }

        Ok(ReadWithoutEncryptionResponse {
            status_flag1,
            status_flag2,
            block_data,
        })
    }
}

struct Chipset<T: Transport> {
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

        let recv_bitrate = match recv_bitrate.unwrap_or(send_bitrate) {
            Bitrate::Bitrate212kbs => [0x0f, 0x01],
            Bitrate::Bitrate424kbs => [0x0f, 0x02],
        };
        let send_bitrate = match send_bitrate {
            Bitrate::Bitrate212kbs => [0x01, 0x01],
            Bitrate::Bitrate424kbs => [0x01, 0x02],
        };
        cmd_data[0..2].copy_from_slice(&send_bitrate);
        cmd_data[2..4].copy_from_slice(&recv_bitrate);

        let data = self.send_packet(CmdCode::InSetRF, &cmd_data)?;

        ensure!(data == [0], "set rf failed");
        Ok(())
    }

    pub fn in_set_protocol(&self, config: &InitiatorConfig) -> anyhow::Result<()> {
        let cmd_data = config.serialize();
        if cmd_data.is_empty() {
            return Ok(());
        }

        let data = self.send_packet(CmdCode::InSetProtocol, &cmd_data)?;

        ensure!(data == [0], "set protocol failed");
        Ok(())
    }

    /// InCommRF
    /// Felicaの各種コマンドを実行する
    /// 詳細は https://www.sony.co.jp/Products/felica/business/tech-support/data/card_usersmanual_2.21j.pdf の4.4コマンド仕様を参照
    pub fn in_comm_rf(&self, send_data: &[u8], timeout: Duration) -> anyhow::Result<Vec<u8>> {
        let timeout = if timeout.as_millis() == 0 {
            0
        } else {
            ((timeout.as_millis() + 1) * 10).min(0xffff) as u16
        };

        let mut cmd_data = vec![0; 3 + send_data.len()];
        cmd_data[0] = (timeout & 0xff) as u8;
        cmd_data[1] = (timeout >> 8) as u8;
        cmd_data[2] = send_data.len() as u8 + 1;
        cmd_data[3..].copy_from_slice(send_data);

        let data = self.send_packet(CmdCode::InCommRF, &cmd_data)?;
        ensure!(data[0..4] == [0, 0, 0, 0], "comm rf failed");

        Ok(data[5..].to_vec())
    }

    pub fn switch_rf(&self, rf: bool) -> anyhow::Result<()> {
        let data = self.send_packet(CmdCode::SwitchRF, &[rf as u8])?;

        ensure!(data == [0], "switch rf failed");
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
        let ack = Packet::deserialize(&ack)?;
        ensure!(ack == Packet::Ack, "ack failed");

        let recv = self.transport.read(None)?;
        let recv = Packet::deserialize(&recv)?;

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
struct InitiatorConfig {
    initial_guard_time: Option<u8>,
    add_crc: Option<u8>,
    check_crc: Option<u8>,
    multi_card: Option<u8>,
    add_parity: Option<u8>,
    check_parity: Option<u8>,
    bitwise_anticoll: Option<u8>,
    last_byte_bit_count: Option<u8>,
    mifare_crypto: Option<u8>,
    add_sof: Option<u8>,
    check_sof: Option<u8>,
    add_eof: Option<u8>,
    check_eof: Option<u8>,
    deaf_time: Option<u8>,
    continuous_receive_mode: Option<u8>,
    min_len_for_crm: Option<u8>,
    type_1_tag_rrdd: Option<u8>,
    rfca: Option<u8>,
    guard_time: Option<u8>,
}

impl Default for InitiatorConfig {
    fn default() -> Self {
        Self {
            initial_guard_time: Some(0x18),
            add_crc: Some(0x01),
            check_crc: Some(0x01),
            multi_card: Some(0x00),
            add_parity: Some(0x00),
            check_parity: Some(0x00),
            bitwise_anticoll: Some(0x00),
            last_byte_bit_count: Some(0x08),
            mifare_crypto: Some(0x00),
            add_sof: Some(0x00),
            check_sof: Some(0x00),
            add_eof: Some(0x00),
            check_eof: Some(0x00),
            deaf_time: Some(0x00),
            continuous_receive_mode: Some(0x00),
            min_len_for_crm: Some(0x00),
            type_1_tag_rrdd: Some(0x00),
            rfca: Some(0x00),
            guard_time: Some(0x06),
        }
    }
}

impl InitiatorConfig {
    fn serialize(self) -> Vec<u8> {
        let mut data = Vec::new();

        if let Some(value) = self.initial_guard_time {
            data.push(0x00);
            data.push(value);
        }

        if let Some(value) = self.add_crc {
            data.push(0x01);
            data.push(value);
        }

        if let Some(value) = self.check_crc {
            data.push(0x02);
            data.push(value);
        }

        if let Some(value) = self.multi_card {
            data.push(0x03);
            data.push(value);
        }

        if let Some(value) = self.add_parity {
            data.push(0x04);
            data.push(value);
        }

        if let Some(value) = self.check_parity {
            data.push(0x05);
            data.push(value);
        }

        if let Some(value) = self.bitwise_anticoll {
            data.push(0x06);
            data.push(value);
        }

        if let Some(value) = self.last_byte_bit_count {
            data.push(0x07);
            data.push(value);
        }

        if let Some(value) = self.mifare_crypto {
            data.push(0x08);
            data.push(value);
        }

        if let Some(value) = self.add_sof {
            data.push(0x09);
            data.push(value);
        }

        if let Some(value) = self.check_sof {
            data.push(0x0a);
            data.push(value);
        }

        if let Some(value) = self.add_eof {
            data.push(0x0b);
            data.push(value);
        }

        if let Some(value) = self.check_eof {
            data.push(0x0c);
            data.push(value);
        }

        if let Some(value) = self.deaf_time {
            data.push(0x0e);
            data.push(value);
        }

        if let Some(value) = self.continuous_receive_mode {
            data.push(0x0f);
            data.push(value);
        }

        if let Some(value) = self.min_len_for_crm {
            data.push(0x10);
            data.push(value);
        }

        if let Some(value) = self.type_1_tag_rrdd {
            data.push(0x11);
            data.push(value);
        }

        if let Some(value) = self.rfca {
            data.push(0x12);
            data.push(value);
        }

        if let Some(value) = self.guard_time {
            data.push(0x13);
            data.push(value);
        }

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

    fn deserialize(packet: &'a [u8]) -> anyhow::Result<Self> {
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
