use std::time::Duration;

use reqwest::Client;
use tracing::{error, info};

use crate::domain::{CardApi, TouchCardRequest, TouchCardResponse};

pub struct HttpCardApi {
    client: Client,
    base_url: String,
    timeout_secs: u64,
}

impl HttpCardApi {
    pub fn new(base_url: impl Into<String>, timeout_secs: u64) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.into(),
            timeout_secs,
        }
    }
}

impl CardApi for HttpCardApi {
    fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse> {
        info!(
            "Sending API request to {}/touch-card with timeout {}s",
            self.base_url, self.timeout_secs
        );

        let start = std::time::Instant::now();
        let response = tokio::task::block_in_place(|| {
            let rt: tokio::runtime::Handle = tokio::runtime::Handle::current();
            rt.block_on(async {
                let result = self
                    .client
                    .post(format!("{}/touch-card", self.base_url))
                    .json(&req)
                    .timeout(Duration::from_secs(self.timeout_secs))
                    .send()
                    .await;

                match result {
                    Ok(response) => {
                        info!("API request successful: status={}", response.status());
                        response.json::<TouchCardResponse>().await
                    }
                    Err(e) => {
                        error!("API request failed: {}", e);
                        Err(e)
                    }
                }
            })
        })?;

        let elapsed = start.elapsed();
        info!("API request completed in {:?}", elapsed);

        Ok(response)
    }
}
