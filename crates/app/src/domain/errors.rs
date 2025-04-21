#[derive(thiserror::Error, Debug)]
pub enum DomainError {
    #[error("カードが登録されていません")]
    UnregisteredCard,

    #[error("カードの読み取りに失敗しました: {0}")]
    CardReadError(String),

    #[error("ネットワークエラー: {0}")]
    Network(#[from] reqwest::Error),

    #[error("サウンド再生エラー: {0}")]
    SoundPlaybackError(String),

    #[error("予期せぬエラー: {0}")]
    Other(#[from] anyhow::Error),
}
