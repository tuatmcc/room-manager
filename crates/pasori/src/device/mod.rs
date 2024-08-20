use crate::felica::{
    BlockCode, Card, PollingRequestCode, PollingResponse, PollingTimeSlot,
    ReadWithoutEncryptionResponse, ServiceCode,
};

pub mod rcs380;

pub trait Device {
    fn polling(
        &self,
        bitrate: Bitrate,
        system_code: Option<u16>,
        request_code: PollingRequestCode,
        time_slot: PollingTimeSlot,
    ) -> anyhow::Result<PollingResponse>;

    fn read_without_encryption(
        &self,
        card: &Card,
        service_codes: &[ServiceCode],
        block_codes: &[BlockCode],
    ) -> anyhow::Result<ReadWithoutEncryptionResponse>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bitrate {
    Bitrate212kbs,
    Bitrate424kbs,
}
