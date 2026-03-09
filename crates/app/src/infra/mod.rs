pub mod api_reqwest;
pub mod system_clock;

pub use api_reqwest::HttpCardApi;
pub use system_clock::SystemClock;

#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub mod gpio_door_lock;
#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub mod player_rodio;
#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub mod reader_pasori;

#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub use gpio_door_lock::GpioDoorLock;
#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub use player_rodio::RodioPlayer;
#[cfg(all(
    feature = "raspi-runtime",
    target_os = "linux",
    any(target_arch = "arm", target_arch = "aarch64")
))]
pub use reader_pasori::PasoriReader;
