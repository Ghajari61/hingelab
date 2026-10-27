//! The only HTTP client in the app. It adds the bearer token, refreshes it when it is about to
//! expire or the server says 401, and turns HTTP answers into errors the UI understands.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::{header, Method, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::Mutex;
use url::Url;

use crate::config;
use crate::error::{CmdError, CmdResult};
use crate::store::{self, Tokens};

/// Largest answer the app reads (a big puzzle SVG is a few MB).
const MAX_BODY: usize = 64 * 1024 * 1024;
/// Refresh this long before the access token expires.
const REFRESH_EARLY: u64 = 60;

pub struct Api {
    http: reqwest::Client,
    base: Url,
    /// Held while refreshing, so two requests never spend the same refresh token (the server
    /// would see the second use as theft and end the session).
    tokens: Mutex<Option<Tokens>>,
}

#[derive(Deserialize)]
struct TokenAnswer {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

impl Api {
    pub fn new(version: &str) -> Self {
        let mut headers = header::HeaderMap::new();
        headers.insert("x-hingelab-client", header::HeaderValue::from_str(&format!("desktop/{version}")).unwrap());
        let http = reqwest::Client::builder()
            .user_agent(format!("HingeLab-Desktop/{version} (Windows)"))
            .default_headers(headers)
            .https_only(!config::allow_insecure_loopback())
            // A redirect could carry the bearer token to another host.
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(90))
            .build()
            .expect("HTTP client");
        Self { http, base: config::api_base(), tokens: Mutex::new(store::load()) }
    }

    pub fn base(&self) -> &Url {
        &self.base
    }

    pub fn url(&self, path: &str) -> Url {
        self.base.join(path).expect("API path")
    }

    pub async fn signed_in(&self) -> bool {
        self.tokens.lock().await.is_some()
    }

    pub async fn set_tokens(&self, t: Tokens) -> CmdResult<()> {
        store::save(&t)?;
        *self.tokens.lock().await = Some(t);
        Ok(())
    }

    /// Forgets the session here and asks the server to revoke it (best effort when offline).
    pub async fn sign_out(&self) {
        let t = self.tokens.lock().await.take();
        store::clear();
        if let Some(t) = t {
            let _ = self
                .http
                .post(self.url("/api/desktop/logout"))
                .bearer_auth(&t.access)
                .json(&serde_json::json!({ "refresh_token": t.refresh }))
                .timeout(Duration::from_secs(10))
                .send()
                .await;
        }
    }

    /// POST /api/desktop/token. Used by sign-in (authorization_code) and refresh.
    pub async fn token_request(&self, body: Value) -> CmdResult<Result<Tokens, u16>> {
        let res = self.http.post(self.url("/api/desktop/token")).json(&body).send().await.map_err(|e| CmdError::network(&e))?;
        let status = res.status();
        if status == StatusCode::OK {
            let a: TokenAnswer = res.json().await.map_err(|_| CmdError::new("server", "The server sent an unexpected answer."))?;
            if !store::valid_token(&a.access_token) || !store::valid_token(&a.refresh_token) || a.expires_in == 0 || a.expires_in > 86_400 {
                return Err(CmdError::new("server", "The server sent an unexpected answer."));
            }
            return Ok(Ok(Tokens { access: a.access_token, refresh: a.refresh_token, access_exp: now() + a.expires_in }));
        }
        if status == StatusCode::BAD_REQUEST || status == StatusCode::UNAUTHORIZED {
            return Ok(Err(status.as_u16()));
        }
        Err(status_error(status, res).await)
    }

    /// A live access token, refreshed first when it is close to expiring (or `force`d after a 401).
    async fn access_token(&self, force_after: Option<&str>) -> CmdResult<String> {
        let mut guard = self.tokens.lock().await;
        let Some(t) = guard.clone() else { return Err(CmdError::unauthorized()) };
        // Another request may have refreshed while this one waited for the lock.
        let stale = match force_after {
            Some(used) => used == t.access,
            None => t.access_exp <= now() + REFRESH_EARLY,
        };
        if !stale {
            return Ok(t.access);
        }
        match self.token_request(serde_json::json!({ "grant_type": "refresh_token", "refresh_token": t.refresh })).await? {
            Ok(next) => {
                store::save(&next)?;
                let access = next.access.clone();
                *guard = Some(next);
                Ok(access)
            }
            Err(_) => {
                // The server ended the session (expired, revoked or reused): sign out here too.
                *guard = None;
                store::clear();
                Err(CmdError::unauthorized())
            }
        }
    }

    /// An authenticated call. Returns the status and JSON body for 2xx and for the statuses in
    /// `pass` (answers the caller handles itself); everything else becomes a `CmdError`.
    pub async fn call(&self, method: Method, path: &str, body: Option<&Value>, pass: &[u16]) -> CmdResult<(u16, Value)> {
        self.call_within(method, path, body, pass, None).await
    }

    /// `call` with its own time limit in place of the client's 90 s.
    pub async fn call_within(&self, method: Method, path: &str, body: Option<&Value>, pass: &[u16], limit: Option<Duration>) -> CmdResult<(u16, Value)> {
        let mut token = self.access_token(None).await?;
        for attempt in 0..2 {
            let mut req = self.http.request(method.clone(), self.url(path)).bearer_auth(&token);
            if let Some(t) = limit {
                req = req.timeout(t);
            }
            if let Some(b) = body {
                req = req.json(b);
            }
            let res = req.send().await.map_err(|e| CmdError::network(&e))?;
            let status = res.status();
            if status == StatusCode::UNAUTHORIZED && attempt == 0 {
                token = self.access_token(Some(&token)).await?;
                continue;
            }
            if status == StatusCode::UNAUTHORIZED {
                *self.tokens.lock().await = None;
                store::clear();
                return Err(CmdError::unauthorized());
            }
            if status.is_success() || pass.contains(&status.as_u16()) {
                return Ok((status.as_u16(), read_json(res).await?));
            }
            return Err(status_error(status, res).await);
        }
        Err(CmdError::unauthorized())
    }

    /// An authenticated call whose answer goes back to the page as it came (any status but 401 and
    /// 426, which end the session or ask for an update here). Returns status, content type and body.
    pub async fn raw(&self, method: Method, path: &str, content_type: Option<&str>, body: Option<&str>) -> CmdResult<(u16, Option<String>, Vec<u8>)> {
        let mut token = self.access_token(None).await?;
        for attempt in 0..2 {
            let mut req = self.http.request(method.clone(), self.url(path)).bearer_auth(&token);
            if path == "/api/desktop/photoproduct" { req = req.timeout(Duration::from_secs(150)); }
            if let Some(ct) = content_type {
                req = req.header(header::CONTENT_TYPE, ct);
            }
            if let Some(b) = body {
                req = req.body(b.to_owned());
            }
            let res = req.send().await.map_err(|e| CmdError::network(&e))?;
            let status = res.status();
            if status == StatusCode::UNAUTHORIZED && attempt == 0 {
                token = self.access_token(Some(&token)).await?;
                continue;
            }
            if status == StatusCode::UNAUTHORIZED {
                *self.tokens.lock().await = None;
                store::clear();
                return Err(CmdError::unauthorized());
            }
            if status.as_u16() == 426 {
                return Err(status_error(status, res).await);
            }
            let ct = res.headers().get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(|s| s.chars().take(120).collect());
            if res.content_length().is_some_and(|n| n as usize > MAX_BODY) {
                return Err(CmdError::new("server", "The answer is too large."));
            }
            let bytes = res.bytes().await.map_err(|e| CmdError::network(&e))?;
            if bytes.len() > MAX_BODY {
                return Err(CmdError::new("server", "The answer is too large."));
            }
            return Ok((status.as_u16(), ct, bytes.to_vec()));
        }
        Err(CmdError::unauthorized())
    }
}

async fn read_json(res: reqwest::Response) -> CmdResult<Value> {
    if res.content_length().is_some_and(|n| n as usize > MAX_BODY) {
        return Err(CmdError::new("server", "The answer is too large."));
    }
    let bytes = res.bytes().await.map_err(|e| CmdError::network(&e))?;
    if bytes.len() > MAX_BODY {
        return Err(CmdError::new("server", "The answer is too large."));
    }
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&bytes).map_err(|_| CmdError::new("server", "The server sent an unexpected answer."))
}

/// Maps an HTTP error status to what the UI shows.
async fn status_error(status: StatusCode, res: reqwest::Response) -> CmdError {
    let retry_after = res.headers().get(header::RETRY_AFTER).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
    let body: Value = read_json(res).await.unwrap_or(Value::Null);
    let message = body.get("message").or_else(|| body.get("error")).and_then(|m| m.as_str()).map(|s| s.chars().take(300).collect::<String>());
    let code = status.as_u16();
    let mut e = match code {
        426 => {
            let mut e = CmdError::new("update_required", message.unwrap_or_else(|| "This version of HingeLab is no longer supported. Update to continue.".into()));
            e.minimum_version = body.get("minimumVersion").and_then(|v| v.as_str()).map(|s| s.chars().take(20).collect());
            e
        }
        429 => {
            let mut e = CmdError::new("rate_limited", "You're going a little fast. Wait a moment and try again.");
            e.retry_after = Some(retry_after.unwrap_or(10).min(3600));
            e
        }
        401 => CmdError::unauthorized(),
        403 => CmdError::new("forbidden", message.unwrap_or_else(|| "Your plan does not include this.".into())),
        500..=599 => CmdError::new("server", if code == 503 { "HingeLab is temporarily unavailable. Try again in a few minutes." } else { "Something went wrong on our side. Try again." }),
        _ => CmdError::new("invalid", message.unwrap_or_else(|| "The request was not accepted.".into())),
    };
    e.status = Some(code);
    e
}
