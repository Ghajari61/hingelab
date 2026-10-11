//! Sign-in through the system browser (RFC 8252): the app listens once on a random 127.0.0.1 port,
//! opens the website's consent page with a PKCE challenge, and exchanges the one-time code it gets
//! back for tokens. The browser's cookies and passwords never reach the app.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use url::Url;

use crate::api::Api;
use crate::error::{CmdError, CmdResult};

/// How long the app waits for the browser.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

/// Bumped to cancel a sign-in that is waiting for the browser.
pub static SIGN_IN_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn random_b64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn challenge_of(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub struct Pending {
    pub listener: TcpListener,
    pub redirect_uri: String,
    pub verifier: String,
    pub state: String,
    pub authorize_url: Url,
}

/// Opens the loopback listener and builds the consent URL.
pub async fn begin(api: &Api) -> CmdResult<Pending> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|_| CmdError::new("io", "Could not start sign-in on this computer."))?;
    let port = listener.local_addr().map_err(|_| CmdError::new("io", "Could not start sign-in on this computer."))?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let verifier = random_b64(64);
    let state = random_b64(32);
    let mut authorize_url = api.url("/desktop/authorize");
    // Only the port: Next.js rewrites a literal 127.0.0.1 inside request URLs to "localhost".
    // The server rebuilds the same redirect_uri, and the token request sends it in the body.
    authorize_url
        .query_pairs_mut()
        .append_pair("port", &port.to_string())
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge_of(&verifier))
        .append_pair("code_challenge_method", "S256");
    Ok(Pending { listener, redirect_uri, verifier, state, authorize_url })
}

pub enum Callback {
    Code(String),
    Denied,
}

/// Waits for the browser to come back with our state; other requests (favicon) get a 404.
pub async fn wait_for_callback(p: &Pending, generation: u64) -> CmdResult<Callback> {
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        if SIGN_IN_GENERATION.load(Ordering::SeqCst) != generation {
            return Err(CmdError::new("cancelled", "Sign-in was cancelled."));
        }
        if Instant::now() >= deadline {
            return Err(CmdError::new("timeout", "Sign-in timed out. Try again."));
        }
        let Ok(Ok((stream, _))) = tokio::time::timeout(Duration::from_millis(500), p.listener.accept()).await else { continue };
        if let Some(cb) = handle(stream, &p.state).await {
            return Ok(cb);
        }
    }
}

async fn handle(mut stream: TcpStream, state: &str) -> Option<Callback> {
    let mut buf = vec![0u8; 8192];
    let mut n = 0;
    while n < buf.len() {
        match tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf[n..])).await {
            Ok(Ok(0)) | Err(_) | Ok(Err(_)) => break,
            Ok(Ok(k)) => {
                n += k;
                if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
        }
    }
    let head = String::from_utf8_lossy(&buf[..n]);
    let outcome = parse_callback(head.lines().next().unwrap_or(""), state);
    let (status, title, text) = match &outcome {
        Some(Callback::Code(_)) => ("200 OK", "You're signed in", "You can close this tab and go back to HingeLab."),
        Some(Callback::Denied) => ("200 OK", "Sign-in cancelled", "You can close this tab and go back to HingeLab."),
        None => ("404 Not Found", "Not found", ""),
    };
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>HingeLab</title><body style=\"font-family:Segoe UI,system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#1d2433\"><div style=\"text-align:center\"><h1 style=\"font-weight:600\">{title}</h1><p>{text}</p></div>"
    );
    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.shutdown().await;
    outcome
}

/// `GET /callback?code=...&state=... HTTP/1.1` with our state, or `error=access_denied`.
pub fn parse_callback(request_line: &str, state: &str) -> Option<Callback> {
    let mut parts = request_line.split(' ');
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    if url.path() != "/callback" {
        return None;
    }
    let mut code = None;
    let mut got_state = None;
    let mut error = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "state" => got_state = Some(v.into_owned()),
            "error" => error = Some(v.into_owned()),
            _ => {}
        }
    }
    if got_state.as_deref() != Some(state) {
        return None;
    }
    if error.is_some() {
        return Some(Callback::Denied);
    }
    let code = code?;
    crate::store::valid_token(&code).then_some(Callback::Code(code))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_rfc_7636() {
        assert_eq!(challenge_of("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let v = random_b64(64);
        assert!(v.len() >= 43 && v.len() <= 128);
        assert_ne!(random_b64(32), random_b64(32));
    }

    #[test]
    fn callback_needs_our_state() {
        let code = "a".repeat(43);
        let ok = format!("GET /callback?code={code}&state=s1 HTTP/1.1");
        assert!(matches!(parse_callback(&ok, "s1"), Some(Callback::Code(c)) if c == code));
        assert!(parse_callback(&ok, "s2").is_none());
        assert!(parse_callback(&format!("POST /callback?code={code}&state=s1 HTTP/1.1"), "s1").is_none());
        assert!(parse_callback(&format!("GET /other?code={code}&state=s1 HTTP/1.1"), "s1").is_none());
        assert!(parse_callback("GET /callback?code=short&state=s1 HTTP/1.1", "s1").is_none());
        assert!(matches!(parse_callback("GET /callback?error=access_denied&state=s1 HTTP/1.1", "s1"), Some(Callback::Denied)));
        assert!(parse_callback("GET /favicon.ico HTTP/1.1", "s1").is_none());
    }
}
