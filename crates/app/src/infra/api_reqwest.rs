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
    async fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse> {
        info!(
            "Sending API request to {}/touch-card with timeout {}s",
            self.base_url, self.timeout_secs
        );

        let start = std::time::Instant::now();

        let response = self
            .client
            .post(format!("{}/touch-card", self.base_url))
            .json(&req)
            .timeout(Duration::from_secs(self.timeout_secs))
            .send()
            .await
            .map_err(|e| {
                error!("API request failed: {}", e);
                anyhow::anyhow!("API request failed: {}", e)
            })?;
        info!("API request successful: status={}", response.status());
        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "API request failed with status: {}",
                response.status()
            ));
        }
        let response = response.json::<TouchCardResponse>().await.map_err(|e| {
            error!("Failed to parse API response: {}", e);
            anyhow::anyhow!("Failed to parse API response: {}", e)
        })?;

        let elapsed = start.elapsed();
        info!("API request completed in {:?}", elapsed);

        Ok(response)
    }
}
