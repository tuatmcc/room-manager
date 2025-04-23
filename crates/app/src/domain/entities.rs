use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub enum CardId {
    Student { id: u32, felica_id: Vec<u8> },
    Suica { idm: String, felica_id: Vec<u8> },
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
    SuicaCardAlreadyRegistered,
    StudentCardNotRegistered,
    SuicaCardNotRegistered,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TouchCardRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suica_idm: Option<String>,
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

impl From<CardId> for TouchCardRequest {
    fn from(card_id: CardId) -> Self {
        match card_id {
            CardId::Student { id, .. } => TouchCardRequest {
                student_id: Some(id),
                suica_idm: None,
            },
            CardId::Suica { idm, .. } => TouchCardRequest {
                student_id: None,
                suica_idm: Some(idm),
            },
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
    RegisterSuicaCard,
}
