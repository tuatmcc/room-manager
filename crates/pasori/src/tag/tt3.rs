#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ServiceCode(u16);

impl ServiceCode {
    pub fn new(service_code: u16) -> Self {
        Self(service_code)
    }

    pub fn to_bytes(self) -> [u8; 2] {
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
    pub fn new(block_code: u16, access_mode: u8, service_code_list_order: u8) -> Self {
        Self {
            block_code,
            access_mode,
            service_code_list_order,
        }
    }

    pub fn to_bytes(self) -> Vec<u8> {
        let mut bytes = Vec::new();

        bytes.push(
            ((self.block_code < 256) as u8) << 7
                | (self.access_mode & 0x07) << 4
                | (self.service_code_list_order & 0x0f),
        );

        bytes.push(self.block_code as u8);
        if self.block_code >= 256 {
            bytes.push((self.block_code >> 8) as u8);
        }

        bytes
    }
}
