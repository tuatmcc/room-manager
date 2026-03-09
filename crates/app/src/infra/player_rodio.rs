use std::io::Cursor;

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};
use room_manager::domain::{SoundEvent, SoundPlayer};
use tracing::info;

pub struct RodioPlayer {
    _sink: MixerDeviceSink,
    player: Player,
}

impl RodioPlayer {
    pub fn new() -> anyhow::Result<Self> {
        info!("Initializing RodioPlayer");

        let sink = DeviceSinkBuilder::open_default_sink()?;
        let player = Player::connect_new(sink.mixer());

        let player = Self {
            _sink: sink,
            player,
        };
        player.play(SoundEvent::Boot)?;
        Ok(player)
    }
}

impl SoundPlayer for RodioPlayer {
    fn play(&self, sound: SoundEvent) -> anyhow::Result<()> {
        info!("Playing sound: {:?}", sound);

        let reader = sound_to_reader(sound);
        let source = Decoder::new(reader)?;

        self.player.append(source);
        info!("Sound queued for playback");

        Ok(())
    }

    fn reset(&self) {
        self.player.clear();
        self.player.play();
    }
}

fn sound_to_reader(sound: SoundEvent) -> Cursor<&'static [u8]> {
    let buf = match sound {
        SoundEvent::Boot => include_bytes!("../assets/sounds/boot.wav").as_slice(),
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
