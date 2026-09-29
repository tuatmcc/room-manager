#![warn(clippy::all, clippy::pedantic)]
mod config;
mod infra;
mod runtime;

use clap::Parser;
use config::Config;
use futures_util::StreamExt as _;
use infra::{HttpCardApi, SystemClock};
use room_manager::app::TouchCardUseCase;
use runtime::{ReaderEvent, new_sound_player, spawn_door_lock, spawn_readers};
use std::env;
use tracing::{error, info};

fn signal_systemd_ready() -> anyhow::Result<()> {
    let Some(socket) = env::var_os("NOTIFY_SOCKET") else {
        return Ok(());
    };

    #[cfg(unix)]
    {
        use std::{mem, os::unix::ffi::OsStrExt};

        let socket = socket.as_os_str().as_bytes();
        anyhow::ensure!(!socket.is_empty(), "NOTIFY_SOCKET must not be empty");

        // systemd accepts both a filesystem Unix socket and an abstract Unix
        // socket (the latter is written as `@name` in NOTIFY_SOCKET).
        let abstract_socket = socket[0] == b'@';
        let path = if abstract_socket {
            &socket[1..]
        } else {
            socket
        };
        let mut address: libc::sockaddr_un = unsafe { mem::zeroed() };
        address.sun_family = libc::sa_family_t::try_from(libc::AF_UNIX)
            .map_err(|_| anyhow::anyhow!("invalid AF_UNIX family"))?;
        anyhow::ensure!(
            path.len() + usize::from(!abstract_socket) <= address.sun_path.len(),
            "NOTIFY_SOCKET path is too long"
        );

        for (index, byte) in path.iter().enumerate() {
            address.sun_path[index + usize::from(abstract_socket)] = *byte as libc::c_char;
        }

        let fd = unsafe { libc::socket(libc::AF_UNIX, libc::SOCK_DGRAM, 0) };
        anyhow::ensure!(fd >= 0, "failed to create systemd notify socket");

        let address_length = libc::socklen_t::try_from(
            mem::size_of_val(&address.sun_family) + path.len() + usize::from(abstract_socket),
        )
        .map_err(|_| anyhow::anyhow!("invalid systemd notify socket length"))?;
        let message = b"READY=1";
        let sent = unsafe {
            libc::sendto(
                fd,
                message.as_ptr().cast(),
                message.len(),
                0,
                (&raw const address).cast(),
                address_length,
            )
        };
        let close_result = unsafe { libc::close(fd) };

        let message_length = isize::try_from(message.len())
            .map_err(|_| anyhow::anyhow!("systemd readiness message is too long"))?;
        anyhow::ensure!(sent == message_length, "failed to notify systemd readiness");
        anyhow::ensure!(close_result == 0, "failed to close systemd notify socket");
    }

    #[cfg(not(unix))]
    let _ = socket;

    info!("signaled systemd readiness");
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_file(true)
        .with_line_number(true)
        .init();

    let config = Config::parse();
    info!(
        version = env!("CARGO_PKG_VERSION"),
        api_path = %config.api_path,
        servo_direction = ?config.servo_direction,
        "starting room-manager app"
    );

    let api = HttpCardApi::new(config.api_path, config.api_token)?;
    info!("initialized api client");

    let player = new_sound_player()?;
    info!("initialized sound player");

    let clock = SystemClock::new();
    info!("initialized system clock");

    let mut readers = spawn_readers()?;
    info!("spawned card readers");

    let door_lock = spawn_door_lock(config.servo_direction).await?;
    info!("spawned door lock");

    let touch_card_use_case = TouchCardUseCase::new(api, player, clock, door_lock);

    match readers.next().await.transpose()? {
        Some(ReaderEvent::Ready) => {}
        Some(ReaderEvent::Card(_)) => {
            anyhow::bail!("received a card event before reader initialization completed");
        }
        None => anyhow::bail!("card reader stream ended before initialization completed"),
    }
    signal_systemd_ready()?;
    info!("starting card reader loop");
    while let Some(event) = readers.next().await {
        let ReaderEvent::Card(card) = event? else {
            continue;
        };
        info!(
            idm = %card.idm,
            student_id = ?card.student_id,
            balance = ?card.balance,
            "received card event"
        );
        if let Err(error) = touch_card_use_case.execute(&card).await {
            error!(
                idm = %card.idm,
                student_id = ?card.student_id,
                balance = ?card.balance,
                error = %error,
                "failed to process card event"
            );
        }
    }

    info!("card reader loop finished");
    Ok(())
}
