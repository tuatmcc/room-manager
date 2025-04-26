use std::time::Duration;

use reqwest::{Client, header::HeaderMap};
use tracing::{error, info};

use crate::domain::{CardApi, TouchCardRequest, TouchCardResponse};

const API_TIMEOUT_SECS: u64 = 5;

pub struct HttpCardApi {
    client: Client,
    api_path: String,
}

impl HttpCardApi {
    pub fn new(api_path: impl Into<String>, api_token: impl Into<String>) -> anyhow::Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(
            "Authorization",
            format!("Bearer {}", api_token.into()).parse()?,
        );

        let client = Client::builder()
            .timeout(Duration::from_secs(API_TIMEOUT_SECS))
            .default_headers(headers)
            .build()?;

        Ok(Self {
            client,
            api_path: api_path.into(),
        })
    }
}

impl CardApi for HttpCardApi {
    async fn touch(&self, req: TouchCardRequest) -> anyhow::Result<TouchCardResponse> {
        info!(
            "Sending API request to {}/local-device/touch-card",
            self.api_path
        );

        let start = std::time::Instant::now();

        let response = self
            .client
            .post(format!("{}/local-device/touch-card", self.api_path))
            .json(&req)
            .timeout(Duration::from_secs(API_TIMEOUT_SECS))
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
