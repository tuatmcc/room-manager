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
        let current_time = Local::now();
        info!(
            "Current time requested: {}",
            current_time.format("%Y-%m-%d %H:%M:%S")
        );
        current_time
    }
}
