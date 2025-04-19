#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Card {
    idm: [u8; 8],
    pmm: [u8; 8],
    system_code: Option<u16>,
}

impl Card {
    pub fn new(idm: [u8; 8], pmm: [u8; 8], system_code: Option<u16>) -> Self {
        Self {
            idm,
            pmm,
            system_code,
        }
    }

    pub fn idm(&self) -> [u8; 8] {
        self.idm
    }

    pub fn pmm(&self) -> [u8; 8] {
        self.pmm
    }

    pub fn system_code(&self) -> Option<u16> {
        self.system_code
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ServiceCode(u16);

impl ServiceCode {
    pub fn new(service_code: u16) -> Self {
        Self(service_code)
    }

    pub fn to_bytes(self) -> [u8; 2] {
        // Little endian
        self.0.to_le_bytes()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlockCode {
    block_code: u16,
    access_mode: u8,
    service_code_list_order: u8,
}

impl BlockCode {
    pub fn new(block_code: u16, access_mode: Option<u8>, service_code_list_order: u8) -> Self {
        let access_mode = access_mode.unwrap_or(0);

        Self {
            block_code,
            access_mode,
            service_code_list_order,
        }
    }

    pub fn to_bytes(self) -> Vec<u8> {
        // byte(2byte) = | 0b0 AccessMode(3bit) ServiceCodeListOrder(4bit) } | BlockCode    |
        // byte(3byte) = | 0b1 AccessMode(3bit) ServiceCodeListOrder(4bit) } | BlockCode(L) | BlockCode(H) |
        let mut bytes = Vec::new();

        bytes.push(
            (((self.block_code < 256) as u8) << 7)
                | ((self.access_mode & 0x07) << 4)
                | (self.service_code_list_order & 0x0f),
        );

        bytes.push(self.block_code as u8);
        if self.block_code >= 256 {
            bytes.push((self.block_code >> 8) as u8);
        }

        bytes
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PollingRequestCode {
    #[default]
    None = 0x00,
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

#[derive(Debug, Clone, Copy)]
pub struct PollingResponse {
    pub card: Card,
    pub request_result: Option<u16>,
}

#[derive(Debug, Clone)]
pub struct ReadWithoutEncryptionResponse {
    pub status_flag1: u8,
    pub status_flag2: u8,
    pub block_data: Vec<Vec<u8>>,
}
