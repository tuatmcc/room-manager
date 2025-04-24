use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct Card {
    pub idm: String,
    pub student_id: Option<u32>,
    pub balance: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoomEntryStatus {
    Entry,
    Exit,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    StudentCardAlreadyRegistered,
    NfcCardAlreadyRegistered,
    StudentCardNotRegistered,
    NfcCardNotRegistered,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TouchCardRequest {
    pub idm: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TouchCardResponse {
    Success {
        status: RoomEntryStatus,
        entries: u32,
    },
    Error {
        error: String,
        error_code: ErrorCode,
    },
}

#[cfg(test)]
impl TouchCardResponse {
    pub fn success_entry(entries: u32) -> Self {
        Self::Success {
            status: RoomEntryStatus::Entry,
            entries,
        }
    }

    pub fn success_exit(entries: u32) -> Self {
        Self::Success {
            status: RoomEntryStatus::Exit,
            entries,
        }
    }

    pub fn error(code: ErrorCode, message: impl Into<String>) -> Self {
        Self::Error {
            error: message.into(),
            error_code: code,
        }
    }
}

impl From<Card> for TouchCardRequest {
    fn from(card: Card) -> Self {
        Self {
            idm: card.idm,
            student_id: card.student_id,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SoundEvent {
    GoodMorning,
    Hello,
    GoodEvening,
    GoodBye,
    Last,
    Error,
    RegisterStudentCard,
    RegisterNfcCard,
}
