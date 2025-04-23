use std::io::Cursor;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use tracing::{error, info, warn};

use crate::domain::{DomainError, SoundEvent, SoundPlayer};

pub struct RodioPlayer {
    _stream: OutputStream,
    _stream_handle: OutputStreamHandle,
    sink: Sink,
}

impl RodioPlayer {
    pub fn new() -> anyhow::Result<Self> {
        info!("Initializing RodioPlayer");
        let (stream, stream_handle) = match OutputStream::try_default() {
            Ok((stream, handle)) => {
                info!("Successfully created audio output stream");
                (stream, handle)
            }
            Err(e) => {
                error!("Failed to create audio output stream: {}", e);
                return Err(e.into());
            }
        };

        let sink = match Sink::try_new(&stream_handle) {
            Ok(sink) => {
                info!("Successfully created audio sink");
                sink
            }
            Err(e) => {
                error!("Failed to create audio sink: {}", e);
                return Err(e.into());
            }
        };

        Ok(Self {
            _stream: stream,
            _stream_handle: stream_handle,
            sink,
        })
    }
}

impl SoundPlayer for RodioPlayer {
    fn play(&self, sound: SoundEvent) -> anyhow::Result<()> {
        info!("Playing sound: {:?}", sound);

        let reader = sound_to_reader(sound);
        let source = match Decoder::new(reader) {
            Ok(src) => {
                info!("Successfully decoded sound");
                src
            }
            Err(e) => {
                error!("Failed to decode sound: {:?}", e);
                return Err(DomainError::SoundPlaybackError(format!("{e:?}")).into());
            }
        };

        self.sink.append(source);
        info!("Sound queued for playback");

        Ok(())
    }
}

fn sound_to_reader(sound: SoundEvent) -> Cursor<&'static [u8]> {
    info!("Loading sound file for event: {:?}", sound);

    let buf = match sound {
        SoundEvent::GoodMorning => {
            info!("Loading good_morning.wav");
            include_bytes!("../assets/sounds/good_morning.wav").as_slice()
        }
        SoundEvent::Hello => {
            info!("Loading hello.wav");
            include_bytes!("../assets/sounds/hello.wav").as_slice()
        }
        SoundEvent::GoodEvening => {
            info!("Loading good_evening.wav");
            include_bytes!("../assets/sounds/good_evening.wav").as_slice()
        }
        SoundEvent::GoodBye => {
            info!("Loading good_bye.wav");
            include_bytes!("../assets/sounds/good_bye.wav").as_slice()
        }
        SoundEvent::Last => {
            info!("Loading last.wav");
            include_bytes!("../assets/sounds/last.wav").as_slice()
        }
        SoundEvent::Error => {
            info!("Loading error.wav");
            include_bytes!("../assets/sounds/error.wav").as_slice()
        }
        SoundEvent::RegisterStudentCard => {
            info!("Loading register_student_card.wav");
            include_bytes!("../assets/sounds/register_student_card.wav").as_slice()
        }
        SoundEvent::RegisterSuicaCard => {
            info!("Loading register_suica_card.wav");
            include_bytes!("../assets/sounds/register_suica_card.wav").as_slice()
        }
    };

    Cursor::new(buf)
}
