use std::time::Duration;

use reqwest::Client;

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
        let response = tokio::task::block_in_place(|| {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                self.client
                    .post(format!("{}/touch-card", self.base_url))
                    .json(&req)
                    .timeout(Duration::from_secs(self.timeout_secs))
                    .send()
                    .await?
                    .json::<TouchCardResponse>()
                    .await
            })
        })?;

        Ok(response)
    }
}
