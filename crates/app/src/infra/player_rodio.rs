use std::io::Cursor;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use tracing::info;

use crate::domain::{SoundEvent, SoundPlayer};

pub struct RodioPlayer {
    _stream: OutputStream,
    _stream_handle: OutputStreamHandle,
    sink: Sink,
}

impl RodioPlayer {
    pub fn new() -> anyhow::Result<Self> {
        info!("Initializing RodioPlayer");

        let (stream, stream_handle) = OutputStream::try_default()?;
        let sink = Sink::try_new(&stream_handle)?;

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
        let source = Decoder::new(reader)?;

        self.sink.append(source);
        info!("Sound queued for playback");

        Ok(())
    }

    fn reset(&self) {
        self.sink.clear();
        self.sink.play();
    }
}

fn sound_to_reader(sound: SoundEvent) -> Cursor<&'static [u8]> {
    let buf = match sound {
        SoundEvent::Touch => include_bytes!("../assets/sounds/touch.wav").as_slice(),
        SoundEvent::GoodMorning => include_bytes!("../assets/sounds/good_morning.wav").as_slice(),
        SoundEvent::Hello => include_bytes!("../assets/sounds/hello.wav").as_slice(),
        SoundEvent::GoodEvening => include_bytes!("../assets/sounds/good_evening.wav").as_slice(),
        SoundEvent::GoodBye => include_bytes!("../assets/sounds/good_bye.wav").as_slice(),
        SoundEvent::Last => include_bytes!("../assets/sounds/last.wav").as_slice(),
        SoundEvent::Error => include_bytes!("../assets/sounds/error.wav").as_slice(),
        SoundEvent::RegisterStudentCard => {
            include_bytes!("../assets/sounds/register_student_card.wav").as_slice()
        }
        SoundEvent::RegisterNfcCard => {
            include_bytes!("../assets/sounds/register_nfc_card.wav").as_slice()
        }
    };

    Cursor::new(buf)
}
