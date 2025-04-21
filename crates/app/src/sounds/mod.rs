use std::io::Cursor;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};

pub struct Player {
    _stream: OutputStream,
    _stream_handle: OutputStreamHandle,
    sink: Sink,
}

impl Player {
    pub fn new() -> anyhow::Result<Self> {
        let (stream, stream_handle) = OutputStream::try_default()?;
        let sink = Sink::try_new(&stream_handle)?;

        Ok(Self {
            _stream: stream,
            _stream_handle: stream_handle,
            sink,
        })
    }

    pub fn play(&self, sound: Sounds) -> anyhow::Result<()> {
        let reader = sound.reader();
        let source = Decoder::new(reader)?;

        self.sink.append(source);

        Ok(())
    }
}

#[derive(Debug, Clone, Copy)]
pub enum Sounds {
    GoodMorning,
    Hello,
    GoodEvening,
    GoodBye,
    Error,
    RegisterStudentCard,
    RegisterSuicaCard,
}

impl Sounds {
    fn reader(&self) -> Cursor<&'static [u8]> {
        use Sounds::*;

        let buf = match self {
            GoodMorning => include_bytes!("./assets/good_morning.wav").as_slice(),
            Hello => include_bytes!("./assets/hello.wav").as_slice(),
            GoodEvening => include_bytes!("./assets/good_evening.wav").as_slice(),
            GoodBye => include_bytes!("./assets/good_bye.wav").as_slice(),
            Error => include_bytes!("./assets/error.wav").as_slice(),
            RegisterStudentCard => include_bytes!("./assets/register_student_card.wav").as_slice(),
            RegisterSuicaCard => include_bytes!("./assets/register_suica_card.wav").as_slice(),
        };

        Cursor::new(buf)
    }
}
