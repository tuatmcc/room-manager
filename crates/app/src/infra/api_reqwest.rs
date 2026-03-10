use std::time::Duration;

use reqwest::{Client, header::HeaderMap};
use room_manager::domain::{CardApi, TouchCardRequest, TouchCardResponse};
use tracing::{error, info};

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
        let start = std::time::Instant::now();
        info!(
            api_path = %self.api_path,
            idm = %req.idm,
            student_id = ?req.student_id,
            "sending touch-card api request"
        );

        let response = self
            .client
            .post(format!("{}/local-device/touch-card", self.api_path))
            .json(&req)
            .timeout(Duration::from_secs(API_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| {
                error!(
                    api_path = %self.api_path,
                    idm = %req.idm,
                    student_id = ?req.student_id,
                    error = %e,
                    "touch-card api request failed"
                );
                anyhow::anyhow!("API request failed: {e}")
            })?;

        let status = response.status();
        let elapsed = start.elapsed().as_millis();
        info!(%status, elapsed_ms = elapsed, "received touch-card api response");

        if !response.status().is_success() {
            error!(
                %status,
                elapsed_ms = elapsed,
                "touch-card api request returned non-success status"
            );
            return Err(anyhow::anyhow!(
                "API request failed with status: {}",
                response.status()
            ));
        }

        let response = response.json::<TouchCardResponse>().await.map_err(|e| {
            error!(
                %status,
                elapsed_ms = elapsed,
                error = %e,
                "failed to parse touch-card api response"
            );
            anyhow::anyhow!("Failed to parse API response: {e}")
        })?;

        info!(
            %status,
            elapsed_ms = start.elapsed().as_millis(),
            "completed touch-card api request"
        );

        Ok(response)
    }
}
