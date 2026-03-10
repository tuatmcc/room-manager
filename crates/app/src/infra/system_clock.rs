use chrono::{DateTime, Local};
use room_manager::domain::Clock;
use tracing::info;

pub struct SystemClock;

impl SystemClock {
    pub fn new() -> Self {
        info!("Initializing SystemClock");
        Self
    }
}

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Local> {
        Local::now()
    }
}
