use pasori::{
    device::{Bitrate, Device, rcs380::RCS380},
    felica::{BlockCode, PollingRequestCode, PollingTimeSlot, ServiceCode},
    transport::Usb,
};
use tokio::sync::mpsc;
use tokio::task;
use tracing::{error, info};

const VENDER_ID: u16 = 0x054c;
const PRODUCT_ID: u16 = 0x06c3;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let transport = Usb::from_id(VENDER_ID, PRODUCT_ID)?;
    let device = RCS380::new(transport)?;
    let (tx, mut rx) = mpsc::channel::<String>(1);

    let mut handle = task::spawn_blocking(move || {
        loop {
            let Ok(polling_res) = device.polling(
                Bitrate::Bitrate424kbs,
                Some(0x809c),
                PollingRequestCode::None,
                PollingTimeSlot::Slot0,
            ) else {
                continue;
            };

            info!("Card detected: {:?}", polling_res.card.idm());
            let read_res = match device.read_without_encryption(
                &polling_res.card,
                &[ServiceCode::new(0x200b)], // 学籍番号が格納されているサービスコード
                &[BlockCode::new(0, None, 0)], // 読み取るブロック
            ) {
                Ok(res) => res,
                Err(e) => {
                    error!("Failed to read card: {:?}", e);
                    continue;
                }
            };

            let read_data = &read_res.block_data[0];
            let student_id =
                std::str::from_utf8(&read_data[7..15]).expect("Failed to parse student ID");
            tx.blocking_send(student_id.to_string())
                .expect("Failed to send student ID");

            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    loop {
        tokio::select! {
            Some(student_id) = rx.recv() => {
                println!("学籍番号: {}", student_id);
            },
            res = &mut handle => {
                match res {
                    Err(e) => panic!("Error in blocking task: {:?}", e),
                    Ok(_) => break,
                }
            }
        }
    }

    Ok(())
}
