#![warn(clippy::all, clippy::pedantic)]
mod app;
mod domain;
mod infra;
#[cfg(test)]
mod tests;

use app::TouchCardUseCase;
use infra::{HttpCardApi, PasoriReader, RodioPlayer, SystemClock};
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    info!("部屋管理アプリケーションを起動しています...");

    // 依存実装を生成
    let api = HttpCardApi::new("https://dev.s2n.tech/local-device", 5);
    let player = RodioPlayer::new()?;
    let clock = SystemClock::new();

    let reader = PasoriReader::spawn()?;

    info!("カードリーダー、API、サウンドプレイヤーを初期化しました");
    info!("カードをスキャンする準備ができました");

    // ユースケースに注入して実行
    let mut use_case = TouchCardUseCase::new(reader, api, player, clock);
    use_case.run_loop().await?;

    Ok(())
}
